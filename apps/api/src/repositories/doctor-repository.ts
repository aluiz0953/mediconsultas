import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface DoctorRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  licenseNumberCiphertext: string;
  licenseHash: string;
  licenseState: string;
  specialty: string;
  phoneCiphertext: string | null;
  addressCiphertext: string | null;
  approvalStatus: ApprovalStatus;
  approvalReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

export type NewDoctorRecord = Omit<
  DoctorRecord,
  'id' | 'createdAt' | 'approvalStatus' | 'approvalReason' | 'approvedBy' | 'approvedAt'
>;

export interface ApprovalUpdate {
  approvalStatus: ApprovalStatus;
  approvalReason: string | null;
  approvedBy: string | null;
  approvedAt: Date;
}

export interface DoctorProfileUpdate {
  fullName: string;
  phoneCiphertext: string | null;
  addressCiphertext: string | null;
}

export type QueueStatus = 'CLOSED' | 'OPEN' | 'PAUSED';

export interface DoctorRepository {
  existsByEmailOrLicenseHash(email: string, licenseHash: string): Promise<boolean>;
  create(record: NewDoctorRecord): Promise<DoctorRecord>;
  findById(id: string): Promise<DoctorRecord | undefined>;
  listPending(): Promise<DoctorRecord[]>;
  listApproved(): Promise<DoctorRecord[]>;
  updateApproval(id: string, update: ApprovalUpdate): Promise<DoctorRecord | undefined>;
  updateProfile(id: string, update: DoctorProfileUpdate): Promise<DoctorRecord | undefined>;
  // Today's queue switch; a status set on a previous day reads as CLOSED.
  getQueueStatus(id: string): Promise<QueueStatus>;
  setQueueStatus(id: string, status: QueueStatus): Promise<void>;
}

// ponytail: same Map-based stand-in as InMemoryPatientRepository — swap for a
// pg-backed repository (doctor_profiles table) once Docker/Postgres exists.
export class InMemoryDoctorRepository implements DoctorRepository {
  private readonly byId = new Map<string, DoctorRecord>();
  private readonly byEmail = new Map<string, DoctorRecord>();
  private readonly byLicenseHash = new Map<string, DoctorRecord>();

  async existsByEmailOrLicenseHash(email: string, licenseHash: string): Promise<boolean> {
    return this.byEmail.has(email) || this.byLicenseHash.has(licenseHash);
  }

  async create(input: NewDoctorRecord): Promise<DoctorRecord> {
    const record: DoctorRecord = {
      ...input,
      id: randomUUID(),
      approvalStatus: 'PENDING_APPROVAL',
      approvalReason: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    this.byEmail.set(record.email, record);
    this.byLicenseHash.set(record.licenseHash, record);
    return record;
  }

  async findById(id: string): Promise<DoctorRecord | undefined> {
    return this.byId.get(id);
  }

  async listPending(): Promise<DoctorRecord[]> {
    return [...this.byId.values()].filter((doctor) => doctor.approvalStatus === 'PENDING_APPROVAL');
  }

  async listApproved(): Promise<DoctorRecord[]> {
    return [...this.byId.values()].filter((doctor) => doctor.approvalStatus === 'APPROVED');
  }

  async updateApproval(id: string, update: ApprovalUpdate): Promise<DoctorRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: DoctorRecord = { ...existing, ...update };
    this.byId.set(id, updated);
    return updated;
  }

  async updateProfile(id: string, update: DoctorProfileUpdate): Promise<DoctorRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    existing.fullName = update.fullName;
    existing.phoneCiphertext = update.phoneCiphertext;
    existing.addressCiphertext = update.addressCiphertext;
    return existing;
  }

  private readonly queue = new Map<string, { status: QueueStatus; day: string }>();

  async getQueueStatus(id: string): Promise<QueueStatus> {
    const entry = this.queue.get(id);
    return entry && entry.day === new Date().toDateString() ? entry.status : 'CLOSED';
  }

  async setQueueStatus(id: string, status: QueueStatus): Promise<void> {
    this.queue.set(id, { status, day: new Date().toDateString() });
  }
}

const DOCTOR_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.created_at,
         d.full_name, d.license_number_ciphertext, d.license_hash, d.license_state, d.specialty,
         d.phone_ciphertext, d.address_ciphertext,
         d.approval_status, d.approval_reason, d.approved_by, d.approved_at
  FROM users u JOIN doctor_profiles d ON d.user_id = u.id
`;

function mapDoctorRow(row: Record<string, unknown>): DoctorRecord {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    licenseNumberCiphertext: row.license_number_ciphertext as string,
    licenseHash: row.license_hash as string,
    licenseState: row.license_state as string,
    specialty: row.specialty as string,
    phoneCiphertext: (row.phone_ciphertext as string | null) ?? null,
    addressCiphertext: (row.address_ciphertext as string | null) ?? null,
    approvalStatus: row.approval_status as ApprovalStatus,
    approvalReason: (row.approval_reason as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

// users + user_roles + doctor_profiles written as one transaction. The doctor's
// account (users.status) is active immediately — clinical work is gated
// separately by doctor_profiles.approval_status (RN-02), not by account status.
export class PgDoctorRepository implements DoctorRepository {
  constructor(private readonly pool: Pool) {}

  async existsByEmailOrLicenseHash(email: string, licenseHash: string): Promise<boolean> {
    const result = await this.pool.query(
      // users.email is unique across every role, so check it on its own.
      `SELECT 1 FROM users WHERE email = $1
       UNION ALL SELECT 1 FROM doctor_profiles WHERE license_hash = $2 LIMIT 1`,
      [email, licenseHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async create(input: NewDoctorRecord): Promise<DoctorRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, status) VALUES ($1, $2, 'ACTIVE') RETURNING id, created_at`,
        [input.email, input.passwordHash],
      );
      const { id, created_at } = userResult.rows[0];
      await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'DOCTOR')`, [id]);
      await client.query(
        `INSERT INTO doctor_profiles (user_id, full_name, license_number_ciphertext, license_hash, license_state, specialty)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, input.fullName, input.licenseNumberCiphertext, input.licenseHash, input.licenseState, input.specialty],
      );
      await client.query('COMMIT');
      return {
        id,
        fullName: input.fullName,
        email: input.email,
        passwordHash: input.passwordHash,
        licenseNumberCiphertext: input.licenseNumberCiphertext,
        licenseHash: input.licenseHash,
        licenseState: input.licenseState,
        specialty: input.specialty,
        phoneCiphertext: input.phoneCiphertext,
        addressCiphertext: input.addressCiphertext,
        approvalStatus: 'PENDING_APPROVAL',
        approvalReason: null,
        approvedBy: null,
        approvedAt: null,
        createdAt: created_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<DoctorRecord | undefined> {
    const result = await this.pool.query(`${DOCTOR_SELECT} WHERE u.id = $1`, [id]);
    const row = result.rows[0];
    return row ? mapDoctorRow(row) : undefined;
  }

  async listPending(): Promise<DoctorRecord[]> {
    const result = await this.pool.query(`${DOCTOR_SELECT} WHERE d.approval_status = 'PENDING_APPROVAL' AND u.deleted_at IS NULL`);
    return result.rows.map(mapDoctorRow);
  }

  async listApproved(): Promise<DoctorRecord[]> {
    const result = await this.pool.query(`${DOCTOR_SELECT} WHERE d.approval_status = 'APPROVED' AND u.deleted_at IS NULL ORDER BY d.full_name`);
    return result.rows.map(mapDoctorRow);
  }

  async updateApproval(id: string, update: ApprovalUpdate): Promise<DoctorRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE doctor_profiles
       SET approval_status = $2, approval_reason = $3, approved_by = $4, approved_at = $5
       WHERE user_id = $1
       RETURNING user_id`,
      [id, update.approvalStatus, update.approvalReason, update.approvedBy, update.approvedAt],
    );
    if (result.rowCount === 0) return undefined;
    return this.findById(id);
  }

  async updateProfile(id: string, update: DoctorProfileUpdate): Promise<DoctorRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE doctor_profiles SET full_name = $2, phone_ciphertext = $3, address_ciphertext = $4 WHERE user_id = $1 RETURNING user_id`,
      [id, update.fullName, update.phoneCiphertext, update.addressCiphertext],
    );
    if (result.rowCount === 0) return undefined;
    return this.findById(id);
  }
  async getQueueStatus(id: string): Promise<QueueStatus> {
    const result = await this.pool.query(
      `SELECT CASE WHEN queue_status_updated_at::date = CURRENT_DATE THEN queue_status ELSE 'CLOSED' END AS status
       FROM doctor_profiles WHERE user_id = $1`,
      [id],
    );
    return (result.rows[0]?.status as QueueStatus | undefined) ?? 'CLOSED';
  }

  async setQueueStatus(id: string, status: QueueStatus): Promise<void> {
    await this.pool.query(
      `UPDATE doctor_profiles SET queue_status = $2, queue_status_updated_at = NOW() WHERE user_id = $1`,
      [id, status],
    );
  }
}
