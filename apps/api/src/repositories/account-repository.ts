import type { Pool } from 'pg';

export type AccountRole = 'ADMIN' | 'SECRETARY' | 'DOCTOR' | 'PATIENT';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DISABLED';

export interface AccountAuth {
  id: string;
  email: string;
  passwordHash: string;
  role: AccountRole;
  status: AccountStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface AccountSummary {
  id: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  fullName: string | null;
  createdAt: Date;
}

export interface AccountSearchFilter {
  query?: string;
  role?: AccountRole;
  status?: AccountStatus;
  limit?: number;
}

export interface NewAccount {
  email: string;
  passwordHash: string;
  role: AccountRole;
  // Display name for roles with no dedicated profile table (ADMIN/SECRETARY).
  // PATIENT/DOCTOR keep their real name in patient_profiles/doctor_profiles.
  fullName: string | null;
}

// Generic operations on `users` + `user_roles` (PRD §16.1), independent of the
// role-specific profile tables. Backs login, self-service password/e-mail
// changes, password reset, and admin account management (RF-04).
export interface AccountRepository {
  findAuthByEmail(email: string): Promise<AccountAuth | undefined>;
  findAuthById(id: string): Promise<AccountAuth | undefined>;
  findSummaryById(id: string): Promise<AccountSummary | undefined>;
  existsByEmail(email: string): Promise<boolean>;
  create(account: NewAccount): Promise<AccountSummary>;
  updateEmail(id: string, email: string): Promise<void>;
  updateFullName(id: string, fullName: string): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  recordFailedLogin(id: string, failedLoginCount: number, lockedUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(id: string): Promise<void>;
  search(filter: AccountSearchFilter): Promise<AccountSummary[]>;
  updateStatus(id: string, status: AccountStatus): Promise<AccountSummary | undefined>;
  countActiveByRole(role: AccountRole): Promise<number>;
  updateRole(id: string, oldRole: AccountRole, newRole: AccountRole, grantedBy: string): Promise<AccountSummary | undefined>;
  // Soft delete: appointments, clinical records and the audit trail reference
  // the user row and must be kept, so the row stays but is disabled, hidden
  // from lookups, and its e-mail is released for reuse.
  remove(id: string): Promise<void>;
}

export function removedEmail(id: string): string {
  return `removido+${id}@removido.invalid`;
}

function mapSummaryRow(row: Record<string, unknown>): AccountSummary {
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as AccountRole,
    status: row.status as AccountStatus,
    fullName: (row.display_name as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly pool: Pool) {}

  async findAuthByEmail(email: string): Promise<AccountAuth | undefined> {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.password_hash, u.status, u.failed_login_count, u.locked_until, ur.role
       FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
       WHERE u.email = $1 LIMIT 1`,
      [email],
    );
    return this.mapAuthRow(result.rows[0]);
  }

  async findAuthById(id: string): Promise<AccountAuth | undefined> {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.password_hash, u.status, u.failed_login_count, u.locked_until, ur.role
       FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
       WHERE u.id = $1 LIMIT 1`,
      [id],
    );
    return this.mapAuthRow(result.rows[0]);
  }

  private mapAuthRow(row: Record<string, unknown> | undefined): AccountAuth | undefined {
    if (!row) return undefined;
    return {
      id: row.id as string,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      status: row.status as AccountStatus,
      failedLoginCount: row.failed_login_count as number,
      lockedUntil: (row.locked_until as Date | null) ?? null,
      role: row.role as AccountRole,
    };
  }

  async findSummaryById(id: string): Promise<AccountSummary | undefined> {
    const result = await this.pool.query(`${SUMMARY_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL`, [id]);
    return result.rows[0] ? mapSummaryRow(result.rows[0]) : undefined;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM users WHERE email = $1 LIMIT 1`, [email]);
    return (result.rowCount ?? 0) > 0;
  }

  async create(account: NewAccount): Promise<AccountSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, status, full_name) VALUES ($1, $2, 'PENDING', $3) RETURNING id, created_at`,
        [account.email, account.passwordHash, account.fullName],
      );
      const { id, created_at } = userResult.rows[0];
      await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [id, account.role]);
      await client.query('COMMIT');
      return {
        id,
        email: account.email,
        role: account.role,
        status: 'PENDING',
        fullName: account.fullName,
        createdAt: created_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateEmail(id: string, email: string): Promise<void> {
    await this.pool.query(`UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1`, [id, email]);
  }

  async updateFullName(id: string, fullName: string): Promise<void> {
    await this.pool.query(`UPDATE users SET full_name = $2, updated_at = NOW() WHERE id = $1`, [id, fullName]);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
      [id, passwordHash],
    );
  }

  async recordFailedLogin(id: string, failedLoginCount: number, lockedUntil: Date | null): Promise<void> {
    await this.pool.query(`UPDATE users SET failed_login_count = $2, locked_until = $3 WHERE id = $1`, [
      id,
      failedLoginCount,
      lockedUntil,
    ]);
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async search(filter: AccountSearchFilter): Promise<AccountSummary[]> {
    const conditions: string[] = ['u.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filter.query) {
      params.push(`%${filter.query.trim()}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR COALESCE(p.full_name, d.full_name, u.full_name) ILIKE $${params.length})`);
    }
    if (filter.role) {
      params.push(filter.role);
      conditions.push(`ur.role = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`u.status = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(filter.limit ?? 50);

    const result = await this.pool.query(
      `${SUMMARY_JOIN} ${where} ORDER BY u.created_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapSummaryRow);
  }

  async updateStatus(id: string, status: AccountStatus): Promise<AccountSummary | undefined> {
    const result = await this.pool.query(`UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id`, [
      id,
      status,
    ]);
    if (result.rowCount === 0) return undefined;
    return this.findSummaryById(id);
  }

  async remove(id: string): Promise<void> {
    // Also frees the CPF/CRM so the person can register again (same tombstone as migration 007).
    const tombstone = `encode(sha256(convert_to('removed:' || $1::text, 'UTF8')), 'hex')`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET status = 'DISABLED', email = $2, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id, removedEmail(id)],
      );
      await client.query(`UPDATE patient_profiles SET cpf_hash = ${tombstone} WHERE user_id = $1`, [id]);
      await client.query(`UPDATE doctor_profiles SET license_hash = ${tombstone} WHERE user_id = $1`, [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async countActiveByRole(role: AccountRole): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
       WHERE ur.role = $1 AND u.status = 'ACTIVE'`,
      [role],
    );
    return result.rows[0].count as number;
  }

  async updateRole(id: string, oldRole: AccountRole, newRole: AccountRole, grantedBy: string): Promise<AccountSummary | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE user_roles SET revoked_at = NOW() WHERE user_id = $1 AND role = $2 AND revoked_at IS NULL`,
        [id, oldRole],
      );
      await client.query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)`, [id, newRole, grantedBy]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.findSummaryById(id);
  }
}

const SUMMARY_JOIN = `
  SELECT u.id, u.email, u.status, u.created_at, ur.role, COALESCE(p.full_name, d.full_name, u.full_name) AS display_name
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
  LEFT JOIN patient_profiles p ON p.user_id = u.id
  LEFT JOIN doctor_profiles d ON d.user_id = u.id
`;
const SUMMARY_SELECT = SUMMARY_JOIN;
