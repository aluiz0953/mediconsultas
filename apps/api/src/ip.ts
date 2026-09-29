// Small IPv4/IPv6 helpers for the abuse and access guards. IPv4 only for
// CIDR matching; IPv6 is compared as text where it matters (private ranges).

export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return 'unknown';
  const value = ip.trim().toLowerCase();
  return value.startsWith('::ffff:') && value.includes('.') ? value.slice(7) : value;
}

export function ipv4ToInt(ip: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export interface Cidr {
  net: number;
  mask: number;
}

export function parseCidr(text: string): Cidr | null {
  const [address, bitsText] = text.trim().split('/');
  const base = ipv4ToInt(address);
  if (base === null) return null;
  const bits = bitsText === undefined ? 32 : Number(bitsText);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { net: (base & mask) >>> 0, mask };
}

export function inCidrs(ip: string, cidrs: Cidr[]): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return cidrs.some((cidr) => ((value & cidr.mask) >>> 0) === cidr.net);
}

// Lookup set indexed by first octet, so a check touches a few hundred ranges at
// most instead of the whole list (matters when the list has ~10k entries and
// the server is under load).
export class CidrSet {
  private readonly byOctet = new Map<number, Cidr[]>();
  private readonly wide: Cidr[] = [];
  readonly size: number;

  constructor(cidrs: Cidr[]) {
    this.size = cidrs.length;
    for (const cidr of cidrs) {
      if (((cidr.mask >>> 24) & 0xff) !== 0xff) {
        this.wide.push(cidr); // prefix shorter than /8 spans several first octets
        continue;
      }
      const octet = cidr.net >>> 24;
      const bucket = this.byOctet.get(octet);
      if (bucket) bucket.push(cidr);
      else this.byOctet.set(octet, [cidr]);
    }
  }

  has(ip: string): boolean {
    const value = ipv4ToInt(ip);
    if (value === null) return false;
    const match = (cidr: Cidr) => ((value & cidr.mask) >>> 0) === cidr.net;
    return (this.byOctet.get(value >>> 24)?.some(match) ?? false) || this.wide.some(match);
  }
}

const PRIVATE_V4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
].map((cidr) => parseCidr(cidr) as Cidr);

// Private/loopback/unattributable addresses are never banned, geo-blocked or
// VPN-blocked: behind a proxy without TRUST_PROXY every visitor looks like the
// proxy, and banning it would lock everyone out.
export function isPrivateIp(ip: string): boolean {
  const value = normalizeIp(ip);
  if (value === 'unknown') return true;
  if (ipv4ToInt(value) !== null) return inCidrs(value, PRIVATE_V4);
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80');
}
