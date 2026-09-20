import { randomUUID } from 'node:crypto';

export type PrescriptionStatus = 'DRAFT' | 'FINALIZED' | 'SUPERSEDED' | 'CANCELLED';

export interface PrescriptionItem {
  medicationName: string;
  strength?: string;
  presentation?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
}

export interface PrescriptionRecord {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  version: number;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
  noMedicationNeeded: boolean;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPrescriptionRecord = Pick<
  PrescriptionRecord,
  'appointmentId' | 'patientId' | 'doctorId' | 'items' | 'noMedicationNeeded'
>;

export interface PrescriptionRepository {
  findByAppointmentId(appointmentId: string): Promise<PrescriptionRecord | undefined>;
  findById(id: string): Promise<PrescriptionRecord | undefined>;
  create(record: NewPrescriptionRecord): Promise<PrescriptionRecord>;
  updateItems(id: string, items: PrescriptionItem[], noMedicationNeeded: boolean): Promise<PrescriptionRecord | undefined>;
  finalize(id: string, issuedAt: Date): Promise<PrescriptionRecord | undefined>;
}

// ponytail: Map-based stand-in for the pg-backed repository (prescriptions +
// prescription_items per migrations/001_init.sql) — swap once Docker/Postgres
// is available. PDF generation and supersede/versioning are out of scope here.
export class InMemoryPrescriptionRepository implements PrescriptionRepository {
  private readonly byId = new Map<string, PrescriptionRecord>();
  private readonly byAppointmentId = new Map<string, PrescriptionRecord>();

  async findByAppointmentId(appointmentId: string): Promise<PrescriptionRecord | undefined> {
    return this.byAppointmentId.get(appointmentId);
  }

  async findById(id: string): Promise<PrescriptionRecord | undefined> {
    return this.byId.get(id);
  }

  async create(input: NewPrescriptionRecord): Promise<PrescriptionRecord> {
    const now = new Date();
    const record: PrescriptionRecord = {
      ...input,
      id: randomUUID(),
      version: 1,
      status: 'DRAFT',
      issuedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    this.byAppointmentId.set(record.appointmentId, record);
    return record;
  }

  async updateItems(id: string, items: PrescriptionItem[], noMedicationNeeded: boolean): Promise<PrescriptionRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: PrescriptionRecord = { ...existing, items, noMedicationNeeded, updatedAt: new Date() };
    this.byId.set(id, updated);
    this.byAppointmentId.set(updated.appointmentId, updated);
    return updated;
  }

  async finalize(id: string, issuedAt: Date): Promise<PrescriptionRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: PrescriptionRecord = { ...existing, status: 'FINALIZED', issuedAt, updatedAt: issuedAt };
    this.byId.set(id, updated);
    this.byAppointmentId.set(updated.appointmentId, updated);
    return updated;
  }
}
