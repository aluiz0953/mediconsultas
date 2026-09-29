import type { Express, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

const isProduction = () => process.env.NODE_ENV === 'production';

// API-only responses (JSON/PDF): nothing here should ever be framed, sniffed,
// cached by an intermediary, or run as a page.
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  if (isProduction()) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

const disabled = () => process.env.RATE_LIMIT_DISABLED === 'true';

const tooMany = { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente em instantes.' };

// Blanket cap per IP, generous enough for normal use (SSE is a single request).
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
  skip: disabled,
});

// Sign-up, verification codes, password reset: cheap for a bot, costly for us
// (e-mail/SMS sends). Login is separate so successful logins don't count.
export const abuseLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
  skip: (req) => disabled() || req.method !== 'POST',
});

// Per-account lockout already exists; this adds a per-IP cap on failed logins
// so one address cannot spray many accounts.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
  skip: disabled,
});

export function applySecurity(app: Express): void {
  app.disable('x-powered-by');
  // Behind a reverse proxy the client IP comes from X-Forwarded-For; set
  // TRUST_PROXY to the number of proxy hops (usually 1), never blindly true.
  const hops = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(hops) && hops > 0) app.set('trust proxy', hops);
  app.use(securityHeaders);
  app.use('/api', apiLimiter);
  app.use('/api/v1/auth/login', loginLimiter);
  app.use(['/api/v1/auth/password-reset', '/api/v1/verifications', '/api/v1/patients/register', '/api/v1/doctors/register'], abuseLimiter);
}

// Refuse to boot with dev-only switches on in production.
export function assertProductionSafe(): void {
  if (isProduction() && process.env.EXPOSE_VERIFICATION_CODE === 'true') {
    throw new Error('EXPOSE_VERIFICATION_CODE must not be enabled when NODE_ENV=production');
  }
}
