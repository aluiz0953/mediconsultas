import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AccountRole } from './account-repository.js';

export type RoleInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface RoleInvitation {
  id: string;
  userId: string;
  role: AccountRole;
  invitedBy: string | null;
  status: RoleInvitationStatus;
  createdAt: Date;
}

// An admin invites an existing account to ADMIN/SECRETARY; the invitee accepts
// or declines it from their own session (migration 008).
export interface RoleInvitationRepository {
  create(userId: string, role: AccountRole, invitedBy: string | null): Promise<RoleInvitation>;
  findById(id: string): Promise<RoleInvitation | undefined>;
  findPendingForUser(userId: string): Promise<RoleInvitation | undefined>;
  respond(id: string, status: Exclude<RoleInvitationStatus, 'PENDING'>): Promise<void>;
}

export class InMemoryRoleInvitationRepository implements RoleInvitationRepository {
  private readonly byId = new Map<string, RoleInvitation>();

  async create(userId: string, role: AccountRole, invitedBy: string | null): Promise<RoleInvitation> {
    const record: RoleInvitation = { id: randomUUID(), userId, role, invitedBy, status: 'PENDING', createdAt: new Date() };
    this.byId.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<RoleInvitation | undefined> {
    return this.byId.get(id);
  }

  async findPendingForUser(userId: string): Promise<RoleInvitation | undefined> {
    return [...this.byId.values()].find((r) => r.userId === userId && r.status === 'PENDING');
  }

  async respond(id: string, status: Exclude<RoleInvitationStatus, 'PENDING'>): Promise<void> {
    const record = this.byId.get(id);
    if (record) record.status = status;
  }
}

function mapRow(row: Record<string, unknown>): RoleInvitation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    role: row.role as AccountRole,
    invitedBy: (row.invited_by as string | null) ?? null,
    status: row.status as RoleInvitationStatus,
    createdAt: row.created_at as Date,
  };
}

export class PgRoleInvitationRepository implements RoleInvitationRepository {
  constructor(private readonly pool: Pool) {}

  async create(userId: string, role: AccountRole, invitedBy: string | null): Promise<RoleInvitation> {
    const result = await this.pool.query(
      `INSERT INTO role_invitations (user_id, role, invited_by) VALUES ($1, $2, $3) RETURNING *`,
      [userId, role, invitedBy],
    );
    return mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<RoleInvitation | undefined> {
    const result = await this.pool.query(`SELECT * FROM role_invitations WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async findPendingForUser(userId: string): Promise<RoleInvitation | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM role_invitations WHERE user_id = $1 AND status = 'PENDING' LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async respond(id: string, status: Exclude<RoleInvitationStatus, 'PENDING'>): Promise<void> {
    await this.pool.query(`UPDATE role_invitations SET status = $2, responded_at = NOW() WHERE id = $1`, [id, status]);
  }
}
