import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

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
  // PAT-07: only prescriptions the patient is actually allowed to see.
  listFinalizedByPatientId(patientId: string): Promise<PrescriptionRecord[]>;
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

  async listFinalizedByPatientId(patientId: string): Promise<PrescriptionRecord[]> {
    return [...this.byId.values()].filter(
      (record) => record.patientId === patientId && record.status === 'FINALIZED',
    );
  }
}

function mapPrescriptionRow(row: Record<string, unknown>, itemRows: Record<string, unknown>[]): PrescriptionRecord {
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string,
    patientId: row.patient_id as string,
    doctorId: row.doctor_id as string,
    version: row.version as number,
    status: row.status as PrescriptionStatus,
    noMedicationNeeded: row.no_medication_needed as boolean,
    issuedAt: (row.issued_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    items: itemRows.map((item) => ({
      medicationName: item.medication_name as string,
      strength: (item.strength as string | undefined) ?? undefined,
      presentation: (item.presentation as string | undefined) ?? undefined,
      dosage: (item.dosage as string | undefined) ?? undefined,
      frequency: (item.frequency as string | undefined) ?? undefined,
      duration: (item.duration as string | undefined) ?? undefined,
      quantity: (item.quantity as string | undefined) ?? undefined,
      instructions: (item.instructions as string | undefined) ?? undefined,
    })),
  };
}

async function replaceItems(client: PoolClient, prescriptionId: string, items: PrescriptionItem[]): Promise<void> {
  await client.query(`DELETE FROM prescription_items WHERE prescription_id = $1`, [prescriptionId]);
  if (items.length === 0) return;
  // One multi-row INSERT instead of one round trip per item.
  const columns = 10;
  const placeholders = items
    .map((_, row) => `(${Array.from({ length: columns }, (__, col) => `$${row * columns + col + 1}`).join(', ')})`)
    .join(', ');
  const values = items.flatMap((item, i) => [
    prescriptionId,
    item.medicationName,
    item.strength,
    item.presentation,
    item.dosage,
    item.frequency,
    item.duration,
    item.quantity,
    item.instructions,
    i,
  ]);
  await client.query(
    `INSERT INTO prescription_items
       (prescription_id, medication_name, strength, presentation, dosage, frequency, duration, quantity, instructions, sort_order)
     VALUES ${placeholders}`,
    values,
  );
}

// prescriptions + prescription_items written as one transaction. Items are
// always replaced wholesale (delete + reinsert) — simplest correct behavior
// for a DRAFT that's still being edited; no partial-item updates needed yet.
export class PgPrescriptionRepository implements PrescriptionRepository {
  constructor(private readonly pool: Pool) {}

  async findByAppointmentId(appointmentId: string): Promise<PrescriptionRecord | undefined> {
    const result = await this.pool.query(`SELECT id FROM prescriptions WHERE appointment_id = $1`, [appointmentId]);
    const id = result.rows[0]?.id;
    return id ? this.findById(id) : undefined;
  }

  async findById(id: string): Promise<PrescriptionRecord | undefined> {
    const prescriptionResult = await this.pool.query(`SELECT * FROM prescriptions WHERE id = $1`, [id]);
    const row = prescriptionResult.rows[0];
    if (!row) return undefined;
    const itemsResult = await this.pool.query(
      `SELECT medication_name, strength, presentation, dosage, frequency, duration, quantity, instructions
       FROM prescription_items WHERE prescription_id = $1 ORDER BY sort_order`,
      [id],
    );
    return mapPrescriptionRow(row, itemsResult.rows);
  }

  async create(input: NewPrescriptionRecord): Promise<PrescriptionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, no_medication_needed)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.appointmentId, input.patientId, input.doctorId, input.noMedicationNeeded],
      );
      const row = result.rows[0];
      await replaceItems(client, row.id, input.items);
      await client.query('COMMIT');
      return mapPrescriptionRow(
        row,
        input.items.map((item) => ({
          medication_name: item.medicationName,
          strength: item.strength,
          presentation: item.presentation,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          quantity: item.quantity,
          instructions: item.instructions,
        })),
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateItems(id: string, items: PrescriptionItem[], noMedicationNeeded: boolean): Promise<PrescriptionRecord | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE prescriptions SET no_medication_needed = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, noMedicationNeeded],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return undefined;
      }
      await replaceItems(client, id, items);
      await client.query('COMMIT');
      return this.findById(id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async finalize(id: string, issuedAt: Date): Promise<PrescriptionRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE prescriptions SET status = 'FINALIZED', issued_at = $2, updated_at = $2 WHERE id = $1 RETURNING *`,
      [id, issuedAt],
    );
    const row = result.rows[0];
    return row ? this.findById(row.id) : undefined;
  }

  async listFinalizedByPatientId(patientId: string): Promise<PrescriptionRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM prescriptions WHERE patient_id = $1 AND status = 'FINALIZED'`,
      [patientId],
    );
    const records = await Promise.all(result.rows.map((row) => this.findById(row.id)));
    return records.filter((record): record is PrescriptionRecord => record !== undefined);
  }
}
