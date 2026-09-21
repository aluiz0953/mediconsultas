import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface PatientRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  cpfCiphertext: string;
  cpfHash: string;
  birthDate: string;
  phoneCiphertext: string;
  addressCiphertext: string;
  status: 'PENDING' | 'ACTIVE';
  createdAt: Date;
}

export type NewPatientRecord = Omit<PatientRecord, 'id' | 'createdAt'>;

export interface PatientProfileUpdate {
  fullName: string;
  phoneCiphertext: string;
  addressCiphertext: string;
}

export interface PatientRepository {
  existsByEmailOrCpfHash(email: string, cpfHash: string): Promise<boolean>;
  create(record: NewPatientRecord): Promise<PatientRecord>;
  findById(id: string): Promise<PatientRecord | undefined>;
  search(query: string): Promise<PatientRecord[]>;
  updateProfile(id: string, update: PatientProfileUpdate): Promise<PatientRecord | undefined>;
}

// ponytail: Map-based stand-in for the pg-backed repository (users + user_roles
// + patient_profiles per migrations/001_init.sql) — swap once Docker/Postgres
// is available locally; the PatientRepository interface stays the same.
export class InMemoryPatientRepository implements PatientRepository {
  private readonly byId = new Map<string, PatientRecord>();
  private readonly byEmail = new Map<string, PatientRecord>();
  private readonly byCpfHash = new Map<string, PatientRecord>();

  async existsByEmailOrCpfHash(email: string, cpfHash: string): Promise<boolean> {
    return this.byEmail.has(email) || this.byCpfHash.has(cpfHash);
  }

  async create(input: NewPatientRecord): Promise<PatientRecord> {
    const record: PatientRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    this.byEmail.set(record.email, record);
    this.byCpfHash.set(record.cpfHash, record);
    return record;
  }

  async findById(id: string): Promise<PatientRecord | undefined> {
    return this.byId.get(id);
  }

  async search(query: string): Promise<PatientRecord[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return [...this.byId.values()].filter((patient) => patient.fullName.toLowerCase().includes(needle));
  }

  async updateProfile(id: string, update: PatientProfileUpdate): Promise<PatientRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    existing.fullName = update.fullName;
    existing.phoneCiphertext = update.phoneCiphertext;
    existing.addressCiphertext = update.addressCiphertext;
    return existing;
  }
}

// users + user_roles + patient_profiles (migrations/001_init.sql) written as one transaction.
export class PgPatientRepository implements PatientRepository {
  constructor(private readonly pool: Pool) {}

  async existsByEmailOrCpfHash(email: string, cpfHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM users u JOIN patient_profiles p ON p.user_id = u.id
       WHERE u.email = $1 OR p.cpf_hash = $2 LIMIT 1`,
      [email, cpfHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async create(input: NewPatientRecord): Promise<PatientRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, status) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [input.email, input.passwordHash, input.status],
      );
      const { id, created_at } = userResult.rows[0];
      await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'PATIENT')`, [id]);
      await client.query(
        `INSERT INTO patient_profiles (user_id, full_name, cpf_ciphertext, cpf_hash, birth_date, phone_ciphertext, address_ciphertext)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, input.fullName, input.cpfCiphertext, input.cpfHash, input.birthDate, input.phoneCiphertext, input.addressCiphertext],
      );
      await client.query('COMMIT');
      return { ...input, id, createdAt: created_at };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<PatientRecord | undefined> {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.password_hash, u.status, u.created_at,
              p.full_name, p.cpf_ciphertext, p.cpf_hash, p.birth_date, p.phone_ciphertext, p.address_ciphertext
       FROM users u JOIN patient_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      passwordHash: row.password_hash,
      cpfCiphertext: row.cpf_ciphertext,
      cpfHash: row.cpf_hash,
      birthDate: row.birth_date instanceof Date ? row.birth_date.toISOString().slice(0, 10) : row.birth_date,
      phoneCiphertext: row.phone_ciphertext,
      addressCiphertext: row.address_ciphertext,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async search(query: string): Promise<PatientRecord[]> {
    const needle = query.trim();
    if (!needle) return [];
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.password_hash, u.status, u.created_at,
              p.full_name, p.cpf_ciphertext, p.cpf_hash, p.birth_date, p.phone_ciphertext, p.address_ciphertext
       FROM users u JOIN patient_profiles p ON p.user_id = u.id
       WHERE p.full_name ILIKE $1
       ORDER BY p.full_name
       LIMIT 20`,
      [`%${needle}%`],
    );
    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      passwordHash: row.password_hash,
      cpfCiphertext: row.cpf_ciphertext,
      cpfHash: row.cpf_hash,
      birthDate: row.birth_date instanceof Date ? row.birth_date.toISOString().slice(0, 10) : row.birth_date,
      phoneCiphertext: row.phone_ciphertext,
      addressCiphertext: row.address_ciphertext,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async updateProfile(id: string, update: PatientProfileUpdate): Promise<PatientRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE patient_profiles SET full_name = $2, phone_ciphertext = $3, address_ciphertext = $4, updated_at = NOW()
       WHERE user_id = $1 RETURNING user_id`,
      [id, update.fullName, update.phoneCiphertext, update.addressCiphertext],
    );
    if (result.rowCount === 0) return undefined;
    return this.findById(id);
  }
}
