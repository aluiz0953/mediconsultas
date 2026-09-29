import type { Express, Request, RequestHandler } from 'express';
import { isPrivateIp, normalizeIp } from './ip.js';

const HONEYPOT_BAN_MS = 60 * 60_000;
const STRIKE_BAN_MS = 15 * 60_000;
const STRIKE_WINDOW_MS = 10 * 60_000;
const STRIKE_LIMIT = 3;
const MAX_TRACKED = 50_000;

interface Entry {
  strikes: number;
  windowStart: number;
  bannedUntil: number;
}

// ponytail: in-memory, per process. Bans are lost on restart and not shared
// between instances; move to Redis if the API is ever scaled horizontally.
const entries = new Map<string, Entry>();

const disabled = () => process.env.ABUSE_GUARD_DISABLED === 'true';

export function securityLog(event: string, fields: Record<string, unknown> = {}): void {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
}

export function clientIp(req: Request): string {
  return normalizeIp(req.ip ?? req.socket.remoteAddress);
}

function makeRoom(now: number): void {
  if (entries.size < MAX_TRACKED) return;
  for (const [ip, entry] of entries) {
    if (entry.bannedUntil <= now && now - entry.windowStart > STRIKE_WINDOW_MS) entries.delete(ip);
  }
  while (entries.size >= MAX_TRACKED) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function ban(ip: string, ms: number, reason: string): void {
  if (disabled() || isPrivateIp(ip)) return;
  const now = Date.now();
  makeRoom(now);
  entries.set(ip, { strikes: 0, windowStart: now, bannedUntil: now + ms });
  securityLog('security.ban', { ip, reason, minutes: Math.round(ms / 60_000) });
}

// Repeated soft offences (e.g. hitting a rate limit) escalate to a ban.
export function strike(ip: string, reason: string): void {
  if (disabled() || isPrivateIp(ip)) return;
  const now = Date.now();
  const current = entries.get(ip);
  const fresh = !current || now - current.windowStart > STRIKE_WINDOW_MS;
  const entry: Entry = fresh
    ? { strikes: 0, windowStart: now, bannedUntil: current?.bannedUntil ?? 0 }
    : (current as Entry);
  entry.strikes += 1;
  makeRoom(now);
  entries.set(ip, entry);
  if (entry.strikes >= STRIKE_LIMIT) ban(ip, STRIKE_BAN_MS, reason);
}

export function isBanned(ip: string): boolean {
  const entry = entries.get(ip);
  if (!entry) return false;
  const now = Date.now();
  if (entry.bannedUntil > now) return true;
  if (now - entry.windowStart > STRIKE_WINDOW_MS) entries.delete(ip);
  return false;
}

export function resetAbuseState(): void {
  entries.clear();
}

// First in the chain: a banned address costs one map lookup and an empty 403.
export const banGuard: RequestHandler = (req, res, next) => {
  if (isBanned(clientIp(req))) {
    res.status(403).end();
    return;
  }
  next();
};

// Paths only scanners and exploit kits request. Nothing here exists in this
// app, and no legitimate client ever links to them.
export const HONEYPOT_PATHS = [
  '/.env',
  '/.env.*',
  '/.git',
  '/.git/*',
  '/.aws/*',
  '/.ssh/*',
  '/wp-login.php',
  '/wp-admin',
  '/wp-admin/*',
  '/wp-content/*',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/phpmyadmin/*',
  '/pma/*',
  '/admin.php',
  '/administrator',
  '/config.php',
  '/backup.sql',
  '/backup.zip',
  '/dump.sql',
  '/server-status',
  '/actuator',
  '/actuator/*',
  '/cgi-bin/*',
  '/vendor/phpunit/*',
  '/boaform/*',
  '/api/v1/debug',
  '/api/v1/admin/backup',
  '/api/v1/admin/export',
  '/api/v1/admin/db',
];

const honeypot: RequestHandler = (req, res) => {
  ban(clientIp(req), HONEYPOT_BAN_MS, `honeypot:${req.path.slice(0, 80)}`);
  res.status(404).json({ code: 'NOT_FOUND', message: 'Recurso não encontrado.' });
};

export function applyHoneypotRoutes(app: Express): void {
  app.all(HONEYPOT_PATHS, honeypot);
}

// Hidden form field ("website"): people never see or fill it, form-scraping
// bots do. A filled field bans the sender and gets a fake success so the bot
// learns nothing. Mount after the JSON body parser.
export const formHoneypot: RequestHandler = (req, res, next) => {
  const value = (req.body as { website?: unknown } | undefined)?.website;
  if (req.method === 'POST' && typeof value === 'string' && value.trim() !== '') {
    ban(clientIp(req), HONEYPOT_BAN_MS, 'form-honeypot');
    res.status(200).json({ ok: true });
    return;
  }
  next();
};
