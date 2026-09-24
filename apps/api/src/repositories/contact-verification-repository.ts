import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type VerificationChannel = 'email' | 'sms';

export interface ContactVerification {
  id: string;
  channel: VerificationChannel;
  destination: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}

// Sign-up verification codes (migration 009).
export interface ContactVerificationRepository {
  create(input: { channel: VerificationChannel; destination: string; codeHash: string; expiresAt: Date }): Promise<ContactVerification>;
  findById(id: string): Promise<ContactVerification | undefined>;
  findLatestForDestination(destination: string): Promise<ContactVerification | undefined>;
  recordAttempt(id: string): Promise<void>;
  markVerified(id: string): Promise<void>;
  // Atomic: only one registration can consume a verification.
  markUsed(id: string): Promise<boolean>;
}

export class InMemoryContactVerificationRepository implements ContactVerificationRepository {
  private readonly byId = new Map<string, ContactVerification>();

  async create(input: { channel: VerificationChannel; destination: string; codeHash: string; expiresAt: Date }) {
    const record: ContactVerification = { id: randomUUID(), ...input, attempts: 0, verifiedAt: null, usedAt: null, createdAt: new Date() };
    this.byId.set(record.id, record);
    return record;
  }

  async findById(id: string) {
    return this.byId.get(id);
  }

  async findLatestForDestination(destination: string) {
    return [...this.byId.values()].filter((r) => r.destination === destination).at(-1);
  }

  async recordAttempt(id: string) {
    const record = this.byId.get(id);
    if (record) record.attempts += 1;
  }

  async markVerified(id: string) {
    const record = this.byId.get(id);
    if (record) record.verifiedAt = new Date();
  }

  async markUsed(id: string) {
    const record = this.byId.get(id);
    if (!record || record.usedAt) return false;
    record.usedAt = new Date();
    return true;
  }
}

function mapRow(row: Record<string, unknown>): ContactVerification {
  return {
    id: row.id as string,
    channel: row.channel as VerificationChannel,
    destination: row.destination as string,
    codeHash: row.code_hash as string,
    attempts: row.attempts as number,
    expiresAt: row.expires_at as Date,
    verifiedAt: (row.verified_at as Date | null) ?? null,
    usedAt: (row.used_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export class PgContactVerificationRepository implements ContactVerificationRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: { channel: VerificationChannel; destination: string; codeHash: string; expiresAt: Date }) {
    const result = await this.pool.query(
      `INSERT INTO contact_verifications (channel, destination, code_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.channel, input.destination, input.codeHash, input.expiresAt],
    );
    return mapRow(result.rows[0]);
  }

  async findById(id: string) {
    const result = await this.pool.query(`SELECT * FROM contact_verifications WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async findLatestForDestination(destination: string) {
    const result = await this.pool.query(
      `SELECT * FROM contact_verifications WHERE destination = $1 ORDER BY created_at DESC LIMIT 1`,
      [destination],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async recordAttempt(id: string) {
    await this.pool.query(`UPDATE contact_verifications SET attempts = attempts + 1 WHERE id = $1`, [id]);
  }

  async markVerified(id: string) {
    await this.pool.query(`UPDATE contact_verifications SET verified_at = NOW() WHERE id = $1`, [id]);
  }

  async markUsed(id: string) {
    const result = await this.pool.query(
      `UPDATE contact_verifications SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
