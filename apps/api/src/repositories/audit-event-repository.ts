import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface AuditEventRecord {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  patientId: string | null;
  result: AuditResult;
  reason: string | null;
  createdAt: Date;
}

export type NewAuditEvent = Omit<AuditEventRecord, 'id' | 'createdAt'>;

export interface AuditEventFilter {
  action?: string;
  resourceType?: string;
  actorUserId?: string;
  limit?: number;
}

// RN-09 / PRD §17.5: every sensitive action must be auditable. Never put
// clinical content, CPF, passwords or tokens in an audit event — only ids,
// role, action name and a short human reason (e.g. rejection justification).
export interface AuditEventRepository {
  record(event: NewAuditEvent): Promise<AuditEventRecord>;
  list(filter?: AuditEventFilter): Promise<AuditEventRecord[]>;
}

export class InMemoryAuditEventRepository implements AuditEventRepository {
  private readonly events: AuditEventRecord[] = [];

  async record(event: NewAuditEvent): Promise<AuditEventRecord> {
    const record: AuditEventRecord = { ...event, id: randomUUID(), createdAt: new Date() };
    this.events.push(record);
    return record;
  }

  async list(filter: AuditEventFilter = {}): Promise<AuditEventRecord[]> {
    let results = [...this.events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filter.action) results = results.filter((event) => event.action === filter.action);
    if (filter.resourceType) results = results.filter((event) => event.resourceType === filter.resourceType);
    if (filter.actorUserId) results = results.filter((event) => event.actorUserId === filter.actorUserId);
    return results.slice(0, filter.limit ?? 100);
  }
}

function mapAuditEventRow(row: Record<string, unknown>): AuditEventRecord {
  return {
    id: row.id as string,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorRole: (row.actor_role as string | null) ?? null,
    action: row.action as string,
    resourceType: row.resource_type as string,
    resourceId: (row.resource_id as string | null) ?? null,
    patientId: (row.patient_id as string | null) ?? null,
    result: row.result as AuditResult,
    reason: (row.reason as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export class PgAuditEventRepository implements AuditEventRepository {
  constructor(private readonly pool: Pool) {}

  async record(event: NewAuditEvent): Promise<AuditEventRecord> {
    const result = await this.pool.query(
      `INSERT INTO audit_events (actor_user_id, actor_role, action, resource_type, resource_id, patient_id, result, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        event.actorUserId,
        event.actorRole,
        event.action,
        event.resourceType,
        event.resourceId,
        event.patientId,
        event.result,
        event.reason,
      ],
    );
    return mapAuditEventRow(result.rows[0]);
  }

  async list(filter: AuditEventFilter = {}): Promise<AuditEventRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.action) {
      params.push(filter.action);
      conditions.push(`action = $${params.length}`);
    }
    if (filter.resourceType) {
      params.push(filter.resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (filter.actorUserId) {
      params.push(filter.actorUserId);
      conditions.push(`actor_user_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);

    const result = await this.pool.query(
      `SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapAuditEventRow);
  }
}
