import { Router } from 'express';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';
import type { RoleInvitationRepository } from '../repositories/role-invitation-repository.js';
import { signSession } from '../auth/token.js';

const SESSION_SECONDS = 1800;

export interface InvitationsRouterConfig {
  jwtSecret: string;
  accountRepository: AccountRepository;
  auditEventRepository: AuditEventRepository;
  roleInvitationRepository: RoleInvitationRepository;
}

// The invitee's side of ADM-03: any signed-in account sees its own pending
// role invitation and accepts or declines it.
export function invitationsRouter(config: InvitationsRouterConfig): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const invitation = await config.roleInvitationRepository.findPendingForUser(req.user!.sub);
    res.json({
      items: invitation ? [{ id: invitation.id, role: invitation.role, created_at: invitation.createdAt.toISOString() }] : [],
    });
  });

  router.post('/:invitationId/:answer(accept|decline)', async (req, res) => {
    const invitation = await config.roleInvitationRepository.findById(req.params.invitationId);
    if (!invitation || invitation.userId !== req.user!.sub || invitation.status !== 'PENDING') {
      res.status(404).json({ code: 'INVITATION_NOT_FOUND', message: 'Convite não encontrado ou já respondido.' });
      return;
    }

    const accepted = req.params.answer === 'accept';
    const account = await config.accountRepository.findAuthById(invitation.userId);
    if (accepted && account?.role === 'ADMIN') {
      // RF-04: leaving ADMIN must not strand the platform without an admin.
      const activeAdmins = await config.accountRepository.countActiveByRole('ADMIN');
      if (activeAdmins <= 1) {
        res.status(409).json({ code: 'LAST_ADMIN', message: 'Não é possível remover o último administrador ativo.' });
        return;
      }
    }

    await config.roleInvitationRepository.respond(invitation.id, accepted ? 'ACCEPTED' : 'DECLINED');
    if (accepted && account) {
      await config.accountRepository.updateRole(account.id, account.role, invitation.role, invitation.invitedBy ?? account.id);
    }

    await config.auditEventRepository.record({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      action: accepted ? 'account.invitation_accepted' : 'account.invitation_declined',
      resourceType: 'user',
      resourceId: invitation.userId,
      patientId: null,
      result: 'SUCCESS',
      reason: accepted ? `${account?.role} -> ${invitation.role}` : `role=${invitation.role}`,
    });

    if (!accepted) {
      res.status(204).end();
      return;
    }
    // The old token still carries the previous role — hand back one with the new role.
    res.json({
      access_token: signSession({ sub: invitation.userId, role: invitation.role }, config.jwtSecret, SESSION_SECONDS),
      token_type: 'Bearer',
      expires_in: SESSION_SECONDS,
    });
  });

  return router;
}
