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
        platform: event.platform ?? null,
        created_at: event.createdAt.toISOString(),
      })),
    });
  });

  // ADM-08 AC: exports require a reason, generate their own audit event, and
  // never surface more than the already-masked fields the list endpoint returns.
  router.get('/export', async (req, res) => {
    const { action, resource_type, actor_id, reason } = req.query;

    if (typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ code: 'REASON_REQUIRED', message: 'Uma justificativa é obrigatória para exportar o log de auditoria.' });
      return;
    }

    const events = await config.repository.list({
      action: typeof action === 'string' ? action : undefined,
      resourceType: typeof resource_type === 'string' ? resource_type : undefined,
      actorUserId: typeof actor_id === 'string' ? actor_id : undefined,
      limit: 5000,
    });

    const header = ['id', 'actor_user_id', 'actor_role', 'action', 'resource_type', 'resource_id', 'patient_id', 'result', 'reason', 'platform', 'created_at'];
    const rows = events.map((event) => [
      event.id,
      event.actorUserId ?? '',
      event.actorRole ?? '',
      event.action,
      event.resourceType,
      event.resourceId ?? '',
      event.patientId ?? '',
      event.result,
      event.reason ?? '',
      event.platform ?? '',
      event.createdAt.toISOString(),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');

    await config.repository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'audit_log.exported',
      resourceType: 'AUDIT_LOG',
      resourceId: null,
      patientId: null,
      result: 'SUCCESS',
      reason: reason.trim(),
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.csv"`);
    res.send(csv);
  });

  return router;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
