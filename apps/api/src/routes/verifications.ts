import { randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type {
  ContactVerificationRepository,
  VerificationChannel,
} from '../repositories/contact-verification-repository.js';
import { hmacSha256Hex } from '../crypto/hmac.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
// How long after verifying the person has to finish the registration.
const VERIFIED_WINDOW_MS = 30 * 60_000;

// ponytail: no e-mail/SMS provider configured yet — codes go to the server
// console. Replace with a real provider call (SMTP, Twilio, Zenvia…) when keys exist.
export type SendVerificationCode = (params: { channel: VerificationChannel; destination: string; code: string }) => void;
export const consoleCodeSender: SendVerificationCode = ({ channel, destination, code }) => {
  console.log(`[${channel} stub] verification code for ${destination}: ${code}`);
};

export function normalizeDestination(channel: VerificationChannel, value: string): string | null {
  if (channel === 'email') {
    const email = value.trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
  }
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return /^\d{10,11}$/.test(digits) ? digits : null; // DDD + number
}

export interface VerificationsRouterConfig {
  repository: ContactVerificationRepository;
  codeHmacSecret: string;
  sendCode: SendVerificationCode;
  // Local/dev only: echo the code in the response so the flow is testable
  // without a real provider. Never enable in production.
  exposeCode?: boolean;
}

export function verificationsRouter(config: VerificationsRouterConfig): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { channel, destination } = req.body ?? {};
    const normalized =
      (channel === 'email' || channel === 'sms') && typeof destination === 'string'
        ? normalizeDestination(channel, destination)
        : null;
    if (!normalized) {
      res.status(400).json({ code: 'INVALID_DESTINATION', message: 'Informe um e-mail ou celular válido.' });
      return;
    }

    const latest = await config.repository.findLatestForDestination(normalized);
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      res.status(429).json({ code: 'TOO_SOON', message: 'Aguarde um minuto antes de pedir outro código.' });
      return;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const record = await config.repository.create({
      channel,
      destination: normalized,
      codeHash: hmacSha256Hex(code, config.codeHmacSecret),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    config.sendCode({ channel, destination: normalized, code });

    res.status(201).json({
      id: record.id,
      expires_in: CODE_TTL_MS / 1000,
      ...(config.exposeCode ? { dev_code: code } : {}),
    });
  });

  router.post('/:verificationId/confirm', async (req, res) => {
    const { code } = req.body ?? {};
    const record = await config.repository.findById(req.params.verificationId);
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ code: 'CODE_EXPIRED', message: 'Código expirado. Peça um novo código.' });
      return;
    }
    if (record.verifiedAt) {
      res.json({ verified: true });
      return;
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      res.status(429).json({ code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Peça um novo código.' });
      return;
    }

    await config.repository.recordAttempt(record.id);
    const given = Buffer.from(hmacSha256Hex(typeof code === 'string' ? code.trim() : '', config.codeHmacSecret));
    if (!timingSafeEqual(given, Buffer.from(record.codeHash))) {
      res.status(400).json({ code: 'INVALID_CODE', message: 'Código incorreto.' });
      return;
    }

    await config.repository.markVerified(record.id);
    res.json({ verified: true });
  });

  return router;
}

// Called by the registration routes: the verification must be confirmed,
// recent, unused and for the same e-mail/phone being registered.
export async function consumeVerification(
  repository: ContactVerificationRepository,
  verificationId: unknown,
  contact: { email: string; phone?: string | null },
): Promise<boolean> {
  if (typeof verificationId !== 'string') return false;
  const record = await repository.findById(verificationId);
  if (!record?.verifiedAt || record.usedAt) return false;
  if (Date.now() - record.verifiedAt.getTime() > VERIFIED_WINDOW_MS) return false;

  const expected =
    record.channel === 'email'
      ? normalizeDestination('email', contact.email)
      : contact.phone
        ? normalizeDestination('sms', contact.phone)
        : null;
  if (expected !== record.destination) return false;

  return repository.markUsed(record.id);
}
