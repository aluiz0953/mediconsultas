import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Request, RequestHandler } from 'express';
import maxmind, { type CountryResponse } from 'maxmind';
import { clientIp, securityLog } from './abuse.js';
import { CidrSet, isPrivateIp, parseCidr, type Cidr } from './ip.js';

export interface AccessConfig {
  /** ISO 3166 alpha-2 codes. Empty disables the country check. */
  allowedCountries: string[];
  blockVpn: boolean;
  vpnRanges: CidrSet;
  bypass: Set<string>;
  countryOf: (ip: string, req: Request) => string | null;
}

const denied = new Map<string, number>();
const LOG_EVERY_MS = 10 * 60_000;

function logDenied(ip: string, reason: string, detail: string | null): void {
  const now = Date.now();
  if (denied.size > 10_000) denied.clear();
  if (now - (denied.get(ip) ?? 0) < LOG_EVERY_MS) return;
  denied.set(ip, now);
  securityLog('security.access-denied', { ip, reason, detail });
}

export function accessPolicy(config: AccessConfig): RequestHandler {
  return (req, res, next) => {
    const ip = clientIp(req);
    if (isPrivateIp(ip) || config.bypass.has(ip)) {
      next();
      return;
    }

    let reason: string | null = null;
    let detail: string | null = null;
    if (config.allowedCountries.length > 0) {
      const country = config.countryOf(ip, req);
      // Unknown country is let through: failing closed would lock out everyone
      // the moment the lookup source is missing.
      if (country && !config.allowedCountries.includes(country)) {
        reason = 'geo';
        detail = country;
      }
    }
    if (!reason && config.blockVpn && config.vpnRanges.has(ip)) reason = 'vpn';

    if (reason) {
      logDenied(ip, reason, detail);
      res.status(403).json({ code: 'ACCESS_RESTRICTED', message: 'Acesso indisponível a partir desta rede ou região.' });
      return;
    }
    next();
  };
}

export function loadCidrFile(file: string): Cidr[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map(parseCidr)
    .filter((cidr): cidr is Cidr => cidr !== null);
}

// Country comes from, in order: a local MaxMind GeoLite2-Country database
// (GEOIP_DB_PATH; IPs never leave the server), or a CDN header that is only
// honoured when GEO_TRUST_HEADER=true, because a client can forge it whenever
// the origin is reachable without the CDN.
export async function loadAccessConfig(env: NodeJS.ProcessEnv = process.env): Promise<AccessConfig> {
  const production = env.NODE_ENV === 'production';
  const allowedCountries = (env.GEO_ALLOWED_COUNTRIES ?? (production ? 'BR' : ''))
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  const blockVpn = (env.BLOCK_VPN ?? (production ? 'true' : 'false')) === 'true';
  const vpnFile = env.VPN_LIST_PATH ?? path.resolve(process.cwd(), 'data/vpn-ipv4.txt');
  const vpnRanges = new CidrSet(blockVpn ? loadCidrFile(vpnFile) : []);
  const bypass = new Set((env.ACCESS_BYPASS_IPS ?? '').split(',').map((ip) => ip.trim()).filter(Boolean));

  let countryOf: AccessConfig['countryOf'] = () => null;
  if (allowedCountries.length > 0) {
    if (env.GEOIP_DB_PATH && existsSync(env.GEOIP_DB_PATH)) {
      const reader = await maxmind.open<CountryResponse>(env.GEOIP_DB_PATH);
      countryOf = (ip) => {
        try {
          return reader.get(ip)?.country?.iso_code ?? null;
        } catch {
          return null;
        }
      };
    } else if (env.GEO_TRUST_HEADER === 'true') {
      const header = (env.GEO_COUNTRY_HEADER ?? 'cf-ipcountry').toLowerCase();
      countryOf = (_ip, req) => {
        const value = req.headers[header];
        if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9]$/.test(value) || value.toUpperCase() === 'XX') return null;
        return value.toUpperCase(); // "T1" (Tor) is never in the allow-list, so it is blocked
      };
    } else {
      securityLog('security.geo-unconfigured', {
        note: 'GEO_ALLOWED_COUNTRIES is set but neither GEOIP_DB_PATH nor GEO_TRUST_HEADER=true is configured; country check is OFF',
      });
    }
  }
  if (blockVpn && vpnRanges.size === 0) {
    securityLog('security.vpn-list-empty', {
      note: `BLOCK_VPN is on but ${vpnFile} is missing or empty; run "npm run update:vpn-list -w apps/api"`,
    });
  }
  return { allowedCountries, blockVpn, vpnRanges, bypass, countryOf };
}
