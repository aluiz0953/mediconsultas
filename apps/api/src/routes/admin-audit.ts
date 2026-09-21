import { Router } from 'express';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';

export interface AdminAuditRouterConfig {
  repository: AuditEventRepository;
}

// ADM-08: read-only, admin-scoped audit trail. Never surfaces clinical
// content, CPF, passwords or tokens — the repository itself never stores them.
export function adminAuditRouter(config: AdminAuditRouterConfig): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { action, resource_type, actor_id } = req.query;

    const events = await config.repository.list({
      action: typeof action === 'string' ? action : undefined,
      resourceType: typeof resource_type === 'string' ? resource_type : undefined,
      actorUserId: typeof actor_id === 'string' ? actor_id : undefined,
      limit: 200,
    });

    res.json({
      items: events.map((event) => ({
        id: event.id,
        actor_user_id: event.actorUserId,
        actor_role: event.actorRole,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        patient_id: event.patientId,
        result: event.result,
        reason: event.reason,
        created_at: event.createdAt.toISOString(),
      })),
    });
  });

  return router;
}
