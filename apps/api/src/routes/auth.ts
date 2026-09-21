import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { PasswordResetRepository } from '../repositories/password-reset-repository.js';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';
import type { SendPasswordResetLink } from '../notifications/mailer.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signSession } from '../auth/token.js';
import { isStrongPassword } from '../validation/password-policy.js';
import { hmacSha256Hex } from '../crypto/hmac.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_TTL_MINUTES = 30;
const DEFAULT_SESSION_SECONDS = 1800; // 30 min, matches RF-01's inactivity-expiry default
const REMEMBER_ME_SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthRouterConfig {
  jwtSecret: string;
  accountRepository: AccountRepository;
  passwordResetRepository: PasswordResetRepository;
  auditEventRepository: AuditEventRepository;
  resetTokenHmacSecret: string;
  sendPasswordResetLink: SendPasswordResetLink;
}

export function authRouter(config: AuthRouterConfig): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password, remember_me } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'email e senha são obrigatórios.' });
      return;
    }

    // RF-01 / PAT-03: same generic failure for "no such user" and "wrong password".
    const genericFailure = () =>
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' });

    const normalizedEmail = email.toLowerCase();
    const user = await config.accountRepository.findAuthByEmail(normalizedEmail);
    if (!user) {
      genericFailure();
      return;
    }

    // RF-01: locked out after too many failed attempts, regardless of this attempt's password.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      res.status(423).json({
        code: 'ACCOUNT_LOCKED',
        message: 'Conta temporariamente bloqueada após várias tentativas inválidas. Tente novamente mais tarde ou redefina sua senha.',
      });
      return;
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
      await config.accountRepository.recordFailedLogin(user.id, failedLoginCount, lockedUntil);
      await config.auditEventRepository.record({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        patientId: null,
        result: 'DENIED',
        reason: null,
      });
      genericFailure();
      return;
    }

    if (user.status !== 'ACTIVE') {
      genericFailure();
      return;
    }

    await config.accountRepository.recordSuccessfulLogin(user.id);
    await config.auditEventRepository.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'auth.login_succeeded',
      resourceType: 'user',
      resourceId: user.id,
      patientId: null,
      result: 'SUCCESS',
      reason: null,
    });

    // "Manter conectado": trades RF-01's 30-min inactivity expiry for a 30-day
    // session when the user explicitly opts in at login.
    const expiresInSeconds = remember_me === true ? REMEMBER_ME_SESSION_SECONDS : DEFAULT_SESSION_SECONDS;
    const token = signSession({ sub: user.id, role: user.role }, config.jwtSecret, expiresInSeconds);
    res.json({ access_token: token, token_type: 'Bearer', expires_in: expiresInSeconds });
  });

  // PAT-03: always the same response whether or not the e-mail exists (no account enumeration).
  router.post('/password-reset/request', async (req, res) => {
    const { email } = req.body ?? {};
    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'E-mail é obrigatório.' });
      return;
    }

    const genericResponse = () => res.json({ message: 'Se o e-mail existir, um link de redefinição foi enviado.' });

    const user = await config.accountRepository.findAuthByEmail(email.toLowerCase());
    if (!user || user.status === 'DISABLED') {
      genericResponse();
      return;
    }

    await config.passwordResetRepository.invalidateAllForUser(user.id);

    const token = randomBytes(32).toString('hex');
    const tokenHash = hmacSha256Hex(token, config.resetTokenHmacSecret);
    await config.passwordResetRepository.create(user.id, tokenHash, new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000));
    config.sendPasswordResetLink({ email: user.email, token, purpose: 'reset' });

    await config.auditEventRepository.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'auth.password_reset_requested',
      resourceType: 'user',
      resourceId: user.id,
      patientId: null,
      result: 'SUCCESS',
      reason: null,
    });

    genericResponse();
  });

  router.post('/password-reset/confirm', async (req, res) => {
    const { token, new_password } = req.body ?? {};
    if (typeof token !== 'string' || !token || typeof new_password !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Token e nova senha são obrigatórios.' });
      return;
    }

    if (!isStrongPassword(new_password)) {
      res.status(400).json({
        code: 'WEAK_PASSWORD',
        message: 'A senha deve ter ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo.',
      });
      return;
    }

    const tokenHash = hmacSha256Hex(token, config.resetTokenHmacSecret);
    const record = await config.passwordResetRepository.findValidByTokenHash(tokenHash);
    if (!record) {
      res.status(400).json({ code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token inválido ou expirado.' });
      return;
    }

    await config.accountRepository.updatePasswordHash(record.userId, await hashPassword(new_password));
    await config.passwordResetRepository.markUsed(record.id);
    await config.passwordResetRepository.invalidateAllForUser(record.userId);

    // ADM-03 invitees are created with status PENDING and no usable password
    // until this step — activate the account once the first password is set.
    const user = await config.accountRepository.findAuthById(record.userId);
    if (user?.status === 'PENDING') {
      await config.accountRepository.updateStatus(record.userId, 'ACTIVE');
    }

    await config.auditEventRepository.record({
      actorUserId: record.userId,
      actorRole: user?.role ?? null,
      action: 'auth.password_reset_completed',
      resourceType: 'user',
      resourceId: record.userId,
      patientId: null,
      result: 'SUCCESS',
      reason: null,
    });

    res.json({ message: 'Senha redefinida com sucesso.' });
  });

  return router;
}
