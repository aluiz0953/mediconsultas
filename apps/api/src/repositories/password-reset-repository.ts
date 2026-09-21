import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// PRD §16.1 "access_tokens e sessions": used both for PAT-03 (forgot password)
// and ADM-03 (admin-invited account sets its own first password) — same
// mechanics, a one-time hashed token with an expiry.
export interface PasswordResetRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetTokenRecord>;
  findValidByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | undefined>;
  markUsed(id: string): Promise<void>;
  invalidateAllForUser(userId: string): Promise<void>;
}

export class InMemoryPasswordResetRepository implements PasswordResetRepository {
  private readonly byId = new Map<string, PasswordResetTokenRecord>();

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetTokenRecord> {
    const record: PasswordResetTokenRecord = {
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    return record;
  }

  async findValidByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | undefined> {
    const record = [...this.byId.values()].find((r) => r.tokenHash === tokenHash);
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return undefined;
    return record;
  }

  async markUsed(id: string): Promise<void> {
    const record = this.byId.get(id);
    if (record) record.usedAt = new Date();
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    for (const record of this.byId.values()) {
      if (record.userId === userId && !record.usedAt) record.usedAt = new Date();
    }
  }
}

function mapRow(row: Record<string, unknown>): PasswordResetTokenRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    expiresAt: row.expires_at as Date,
    usedAt: (row.used_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export class PgPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly pool: Pool) {}

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetTokenRecord> {
    const result = await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING *`,
      [userId, tokenHash, expiresAt],
    );
    return mapRow(result.rows[0]);
  }

  async findValidByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async markUsed(id: string): Promise<void> {
    await this.pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [id]);
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
  }
}
