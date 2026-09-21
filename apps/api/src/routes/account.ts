import { Router } from 'express';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { isStrongPassword } from '../validation/password-policy.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AccountRouterConfig {
  accountRepository: AccountRepository;
  auditEventRepository: AuditEventRepository;
}

// RF-03: password and e-mail belong to the account (`users` table), not to a
// role-specific profile, so this is shared by every role. Mount behind
// requireAuth only (no requireRole).
export function accountRouter(config: AccountRouterConfig): Router {
  const router = Router();

  router.patch('/password', async (req, res) => {
    const userId = req.user!.sub;
    const { current_password, new_password } = req.body ?? {};
    if (typeof current_password !== 'string' || typeof new_password !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Senha atual e nova senha são obrigatórias.' });
      return;
    }

    const account = await config.accountRepository.findAuthById(userId);
    if (!account || !(await verifyPassword(current_password, account.passwordHash))) {
      res.status(401).json({ code: 'INVALID_CURRENT_PASSWORD', message: 'Senha atual incorreta.' });
      return;
    }

    if (!isStrongPassword(new_password)) {
      res.status(400).json({
        code: 'WEAK_PASSWORD',
        message: 'A senha deve ter ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo.',
      });
      return;
    }

    await config.accountRepository.updatePasswordHash(userId, await hashPassword(new_password));
    await config.auditEventRepository.record({
      actorUserId: userId,
      actorRole: req.user!.role,
      action: 'account.password_changed',
      resourceType: 'user',
      resourceId: userId,
      patientId: null,
      result: 'SUCCESS',
      reason: null,
    });

    res.json({ message: 'Senha atualizada com sucesso.' });
  });

  // RF-03: e-mail change takes effect immediately — no e-mail provider is
  // wired up yet to gate it behind a confirmation link (see notifications/mailer.ts).
  router.patch('/email', async (req, res) => {
    const userId = req.user!.sub;
    const { new_email, current_password } = req.body ?? {};
    if (typeof new_email !== 'string' || !EMAIL_RE.test(new_email) || typeof current_password !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Novo e-mail válido e senha atual são obrigatórios.' });
      return;
    }

    const account = await config.accountRepository.findAuthById(userId);
    if (!account || !(await verifyPassword(current_password, account.passwordHash))) {
      res.status(401).json({ code: 'INVALID_CURRENT_PASSWORD', message: 'Senha atual incorreta.' });
      return;
    }

    const normalizedEmail = new_email.toLowerCase();
    if (normalizedEmail !== account.email && (await config.accountRepository.existsByEmail(normalizedEmail))) {
      res.status(409).json({ code: 'EMAIL_ALREADY_IN_USE', message: 'E-mail já está em uso.' });
      return;
    }

    await config.accountRepository.updateEmail(userId, normalizedEmail);
    await config.auditEventRepository.record({
      actorUserId: userId,
      actorRole: req.user!.role,
      action: 'account.email_changed',
      resourceType: 'user',
      resourceId: userId,
      patientId: null,
      result: 'SUCCESS',
      reason: null,
    });

    res.json({ message: 'E-mail atualizado com sucesso.', email: normalizedEmail });
  });

  return router;
}
