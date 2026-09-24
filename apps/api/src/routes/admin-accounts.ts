import { Router } from 'express';
import type { AccountRepository, AccountRole, AccountStatus } from '../repositories/account-repository.js';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';
import type { PasswordResetRepository } from '../repositories/password-reset-repository.js';
import type { RoleInvitationRepository } from '../repositories/role-invitation-repository.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ADM-05: role changes are only allowed between the two roles with no
// dedicated profile table (ADMIN/SECRETARY). Changing role for a PATIENT or
// DOCTOR account would strand its patient_profiles/doctor_profiles row and
// the clinical data tied to it — out of scope for this endpoint.
const INVITABLE_ROLES: AccountRole[] = ['ADMIN', 'SECRETARY'];

const ALLOWED_STATUS_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  PENDING: ['ACTIVE', 'DISABLED'],
  ACTIVE: ['LOCKED', 'SUSPENDED', 'DISABLED'],
  LOCKED: ['ACTIVE', 'DISABLED'],
  SUSPENDED: ['ACTIVE', 'DISABLED'],
  DISABLED: [],
};

export interface AdminAccountsRouterConfig {
  accountRepository: AccountRepository;
  auditEventRepository: AuditEventRepository;
  passwordResetRepository: PasswordResetRepository;
  roleInvitationRepository: RoleInvitationRepository;
}

export function adminAccountsRouter(config: AdminAccountsRouterConfig): Router {
  const router = Router();

  // ADM-02
  router.get('/', async (req, res) => {
    const { query, role, status, limit } = req.query;
    const accounts = await config.accountRepository.search({
      query: typeof query === 'string' ? query : undefined,
      role: typeof role === 'string' ? (role as AccountRole) : undefined,
      status: typeof status === 'string' ? (status as AccountStatus) : undefined,
      limit: typeof limit === 'string' ? Number(limit) : undefined,
    });

    res.json({
      items: accounts.map((account) => ({
        id: account.id,
        email: account.email,
        role: account.role,
        status: account.status,
        full_name: account.fullName,
        created_at: account.createdAt,
      })),
    });
  });

  // ADM-03: invites an EXISTING account to become ADMIN or SECRETARY. Nothing
  // changes until the invitee accepts it from their own session (see invitations.ts).
  router.post('/', async (req, res) => {
    const { email, role } = req.body ?? {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || typeof role !== 'string' || !INVITABLE_ROLES.includes(role as AccountRole)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'E-mail e perfil (ADMIN ou SECRETARY) são obrigatórios.' });
      return;
    }

    const invitee = await config.accountRepository.findAuthByEmail(email.trim().toLowerCase());
    if (!invitee) {
      res.status(404).json({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Nenhuma conta com este e-mail. A pessoa precisa se cadastrar antes de receber o convite.',
      });
      return;
    }
    if (invitee.role === 'DOCTOR') {
      res.status(400).json({
        code: 'ROLE_CHANGE_NOT_SUPPORTED',
        message: 'Contas de médico não podem ser convidadas: a agenda e os atendimentos dependem desse perfil.',
      });
      return;
    }
    if (invitee.role === role) {
      res.status(409).json({ code: 'ALREADY_HAS_ROLE', message: 'Esta conta já tem esse perfil.' });
      return;
    }
    if (invitee.status !== 'ACTIVE') {
      res.status(400).json({ code: 'ACCOUNT_NOT_ACTIVE', message: 'Só contas ativas podem receber convites.' });
      return;
    }
    if (await config.roleInvitationRepository.findPendingForUser(invitee.id)) {
      res.status(409).json({ code: 'INVITATION_PENDING', message: 'Esta conta já tem um convite aguardando resposta.' });
      return;
    }

    const invitation = await config.roleInvitationRepository.create(invitee.id, role as AccountRole, req.user?.sub ?? null);

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'account.invited',
      resourceType: 'user',
      resourceId: invitee.id,
      patientId: null,
      result: 'SUCCESS',
      reason: `${invitee.role} -> ${role}`,
    });

    res.status(201).json({ id: invitation.id, role: invitation.role, status: invitation.status });
  });

  // ADM-04
  router.patch('/:accountId/status', async (req, res) => {
    const { status, reason } = req.body ?? {};
    if (typeof status !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Status é obrigatório.' });
      return;
    }
    if (status !== 'ACTIVE' && (typeof reason !== 'string' || !reason.trim())) {
      res.status(400).json({
        code: 'REASON_REQUIRED',
        message: 'Justificativa é obrigatória para bloquear, suspender ou desativar.',
      });
      return;
    }

    const existing = await config.accountRepository.findSummaryById(req.params.accountId);
    if (!existing) {
      res.status(404).json({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' });
      return;
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(status as AccountStatus)) {
      res.status(400).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Não é possível mudar de ${existing.status} para ${status}.`,
      });
      return;
    }

    // RF-04: never leave the platform without at least one active admin.
    if (existing.role === 'ADMIN' && status !== 'ACTIVE') {
      const activeAdmins = await config.accountRepository.countActiveByRole('ADMIN');
      if (activeAdmins <= 1) {
        res.status(409).json({ code: 'LAST_ADMIN', message: 'Não é possível remover o último administrador ativo.' });
        return;
      }
    }

    const updated = await config.accountRepository.updateStatus(req.params.accountId, status as AccountStatus);

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'account.status_changed',
      resourceType: 'user',
      resourceId: req.params.accountId,
      patientId: null,
      result: 'SUCCESS',
      reason: typeof reason === 'string' ? reason.trim() : null,
    });

    res.json({ id: updated!.id, status: updated!.status });
  });

  // ADM-05: scoped to ADMIN <-> SECRETARY only — see INVITABLE_ROLES comment above.
  router.patch('/:accountId/role', async (req, res) => {
    const { role } = req.body ?? {};
    if (typeof role !== 'string' || !INVITABLE_ROLES.includes(role as AccountRole)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Perfil deve ser ADMIN ou SECRETARY.' });
      return;
    }

    const existing = await config.accountRepository.findSummaryById(req.params.accountId);
    if (!existing) {
      res.status(404).json({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' });
      return;
    }

    if (!INVITABLE_ROLES.includes(existing.role)) {
      res.status(400).json({
        code: 'ROLE_CHANGE_NOT_SUPPORTED',
        message: 'Alteração de perfil não é suportada para contas de médico ou paciente.',
      });
      return;
    }

    if (existing.role === role) {
      res.json({ id: existing.id, role: existing.role });
      return;
    }

    if (existing.role === 'ADMIN') {
      const activeAdmins = await config.accountRepository.countActiveByRole('ADMIN');
      if (activeAdmins <= 1) {
        res.status(409).json({ code: 'LAST_ADMIN', message: 'Não é possível remover o último administrador ativo.' });
        return;
      }
    }

    const updated = await config.accountRepository.updateRole(
      req.params.accountId,
      existing.role,
      role as AccountRole,
      req.user!.sub,
    );

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'account.role_changed',
      resourceType: 'user',
      resourceId: req.params.accountId,
      patientId: null,
      result: 'SUCCESS',
      reason: `${existing.role} -> ${role}`,
    });

    res.json({ id: updated!.id, role: updated!.role });
  });

  // Removes an account from the platform. Soft delete — see AccountRepository.remove.
  router.delete('/:accountId', async (req, res) => {
    const { reason } = req.body ?? {};
    if (typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ code: 'REASON_REQUIRED', message: 'Justificativa é obrigatória para remover uma conta.' });
      return;
    }
    if (req.params.accountId === req.user?.sub) {
      res.status(400).json({ code: 'CANNOT_REMOVE_SELF', message: 'Você não pode remover a própria conta.' });
      return;
    }

    const existing = await config.accountRepository.findSummaryById(req.params.accountId);
    if (!existing) {
      res.status(404).json({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' });
      return;
    }

    if (existing.role === 'ADMIN' && existing.status === 'ACTIVE') {
      const activeAdmins = await config.accountRepository.countActiveByRole('ADMIN');
      if (activeAdmins <= 1) {
        res.status(409).json({ code: 'LAST_ADMIN', message: 'Não é possível remover o último administrador ativo.' });
        return;
      }
    }

    await config.accountRepository.remove(existing.id);
    await config.passwordResetRepository.invalidateAllForUser(existing.id);

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'account.removed',
      resourceType: 'user',
      resourceId: existing.id,
      patientId: null,
      result: 'SUCCESS',
      reason: `role=${existing.role}; ${reason.trim()}`,
    });

    res.status(204).end();
  });

  return router;
}
