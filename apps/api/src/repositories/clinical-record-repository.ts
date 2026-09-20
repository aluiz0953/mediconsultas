import { randomUUID } from 'node:crypto';

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
}
