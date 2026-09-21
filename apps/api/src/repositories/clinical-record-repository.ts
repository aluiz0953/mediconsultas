import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type ClinicalRecordStatus = 'DRAFT' | 'FINALIZED' | 'AMENDED' | 'ARCHIVED';

export interface ClinicalRecordRecord {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  version: number;
  status: ClinicalRecordStatus;
  contentCiphertext: string;
  finalizedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewClinicalRecordRecord = Pick<
  ClinicalRecordRecord,
  'appointmentId' | 'patientId' | 'doctorId' | 'contentCiphertext'
>;

export interface FinalizeInput {
  finalizedAt: Date;
  releasedAt: Date | null;
}

export interface ClinicalRecordRepository {
  findByAppointmentId(appointmentId: string): Promise<ClinicalRecordRecord | undefined>;
  findById(id: string): Promise<ClinicalRecordRecord | undefined>;
  create(record: NewClinicalRecordRecord): Promise<ClinicalRecordRecord>;
  updateContent(id: string, contentCiphertext: string): Promise<ClinicalRecordRecord | undefined>;
  finalize(id: string, input: FinalizeInput): Promise<ClinicalRecordRecord | undefined>;
  // PAT-06: only records the patient is actually allowed to see (RN-06).
  listReleasedByPatientId(patientId: string): Promise<ClinicalRecordRecord[]>;
}

// ponytail: Map-based stand-in for the pg-backed repository (clinical_records
// table per migrations/001_init.sql) — swap once Docker/Postgres is available.
// Amendments (supersedes_record_id) are out of scope until DOC-05's follow-up.
export class InMemoryClinicalRecordRepository implements ClinicalRecordRepository {
  private readonly byId = new Map<string, ClinicalRecordRecord>();
  private readonly byAppointmentId = new Map<string, ClinicalRecordRecord>();

  async findByAppointmentId(appointmentId: string): Promise<ClinicalRecordRecord | undefined> {
    return this.byAppointmentId.get(appointmentId);
  }

  async findById(id: string): Promise<ClinicalRecordRecord | undefined> {
    return this.byId.get(id);
  }

  async create(input: NewClinicalRecordRecord): Promise<ClinicalRecordRecord> {
    const now = new Date();
    const record: ClinicalRecordRecord = {
      ...input,
      id: randomUUID(),
      version: 1,
      status: 'DRAFT',
      finalizedAt: null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    this.byAppointmentId.set(record.appointmentId, record);
    return record;
  }

  async updateContent(id: string, contentCiphertext: string): Promise<ClinicalRecordRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: ClinicalRecordRecord = { ...existing, contentCiphertext, updatedAt: new Date() };
    this.byId.set(id, updated);
    this.byAppointmentId.set(updated.appointmentId, updated);
    return updated;
  }

  async finalize(id: string, input: FinalizeInput): Promise<ClinicalRecordRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: ClinicalRecordRecord = {
      ...existing,
      status: 'FINALIZED',
      finalizedAt: input.finalizedAt,
      releasedAt: input.releasedAt,
      updatedAt: input.finalizedAt,
    };
    this.byId.set(id, updated);
    this.byAppointmentId.set(updated.appointmentId, updated);
    return updated;
  }

  async listReleasedByPatientId(patientId: string): Promise<ClinicalRecordRecord[]> {
    return [...this.byId.values()].filter(
      (record) => record.patientId === patientId && record.status === 'FINALIZED' && record.releasedAt !== null,
    );
  }
}

function mapClinicalRecordRow(row: Record<string, unknown>): ClinicalRecordRecord {
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string,
    patientId: row.patient_id as string,
    doctorId: row.doctor_id as string,
    version: row.version as number,
    status: row.status as ClinicalRecordStatus,
    contentCiphertext: row.clinical_content_ciphertext as string,
    finalizedAt: (row.finalized_at as Date | null) ?? null,
    releasedAt: (row.released_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export class PgClinicalRecordRepository implements ClinicalRecordRepository {
  constructor(private readonly pool: Pool) {}

  async findByAppointmentId(appointmentId: string): Promise<ClinicalRecordRecord | undefined> {
    const result = await this.pool.query(`SELECT * FROM clinical_records WHERE appointment_id = $1`, [appointmentId]);
    const row = result.rows[0];
    return row ? mapClinicalRecordRow(row) : undefined;
  }

  async findById(id: string): Promise<ClinicalRecordRecord | undefined> {
    const result = await this.pool.query(`SELECT * FROM clinical_records WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? mapClinicalRecordRow(row) : undefined;
  }

  async create(input: NewClinicalRecordRecord): Promise<ClinicalRecordRecord> {
    const result = await this.pool.query(
      `INSERT INTO clinical_records (appointment_id, patient_id, doctor_id, clinical_content_ciphertext)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.appointmentId, input.patientId, input.doctorId, input.contentCiphertext],
    );
    return mapClinicalRecordRow(result.rows[0]);
  }

  async updateContent(id: string, contentCiphertext: string): Promise<ClinicalRecordRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE clinical_records SET clinical_content_ciphertext = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, contentCiphertext],
    );
    const row = result.rows[0];
    return row ? mapClinicalRecordRow(row) : undefined;
  }

  async finalize(id: string, input: FinalizeInput): Promise<ClinicalRecordRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE clinical_records
       SET status = 'FINALIZED', finalized_at = $2, released_at = $3, updated_at = $2
       WHERE id = $1
       RETURNING *`,
      [id, input.finalizedAt, input.releasedAt],
    );
    const row = result.rows[0];
    return row ? mapClinicalRecordRow(row) : undefined;
  }

  async listReleasedByPatientId(patientId: string): Promise<ClinicalRecordRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM clinical_records WHERE patient_id = $1 AND status = 'FINALIZED' AND released_at IS NOT NULL`,
      [patientId],
    );
    return result.rows.map(mapClinicalRecordRow);
  }
}
