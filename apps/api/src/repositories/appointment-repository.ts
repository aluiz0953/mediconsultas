import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PATIENT_ABSENT'
  | 'DOCTOR_ABSENT';

export interface AppointmentRecord {
  id: string;
  patientId: string;
  doctorId: string;
  unitId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  administrativeNote: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export type NewAppointmentRecord = Omit<AppointmentRecord, 'id' | 'createdAt' | 'status'>;

export interface AppointmentRepository {
  // RN-04: a doctor can't have two overlapping active (non-cancelled) appointments.
  hasConflict(doctorId: string, startsAt: Date, endsAt: Date): Promise<boolean>;
  create(record: NewAppointmentRecord): Promise<AppointmentRecord>;
  findById(id: string): Promise<AppointmentRecord | undefined>;
  updateStatus(id: string, status: AppointmentStatus): Promise<AppointmentRecord | undefined>;
  listByDateRange(from: Date, to: Date): Promise<AppointmentRecord[]>;
  listByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<AppointmentRecord[]>;
  // PAT-04: every appointment ever booked for this patient, most recent first.
  listByPatientId(patientId: string): Promise<AppointmentRecord[]>;
}

// ponytail: Map-based stand-in for the pg-backed repository (appointments table
// per migrations/001_init.sql, with an exclusion constraint doing this check at
// the DB level) — swap once Docker/Postgres is available locally.
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly byId = new Map<string, AppointmentRecord>();

  async hasConflict(doctorId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    return [...this.byId.values()].some(
      (appt) =>
        appt.doctorId === doctorId &&
        appt.status !== 'CANCELLED' &&
        appt.startsAt.getTime() < endsAt.getTime() &&
        startsAt.getTime() < appt.endsAt.getTime(),
    );
  }

  async create(input: NewAppointmentRecord): Promise<AppointmentRecord> {
    const record: AppointmentRecord = {
      ...input,
      id: randomUUID(),
      status: 'SCHEDULED',
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<AppointmentRecord | undefined> {
    return this.byId.get(id);
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<AppointmentRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: AppointmentRecord = { ...existing, status };
    this.byId.set(id, updated);
    return updated;
  }

  async listByDateRange(from: Date, to: Date): Promise<AppointmentRecord[]> {
    return [...this.byId.values()]
      .filter((appt) => appt.startsAt.getTime() >= from.getTime() && appt.startsAt.getTime() < to.getTime())
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async listByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    const inRange = await this.listByDateRange(from, to);
    return inRange.filter((appt) => appt.doctorId === doctorId);
  }

  async listByPatientId(patientId: string): Promise<AppointmentRecord[]> {
    return [...this.byId.values()]
      .filter((appt) => appt.patientId === patientId)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  }
}

function mapAppointmentRow(row: Record<string, unknown>): AppointmentRecord {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    doctorId: row.doctor_id as string,
    unitId: (row.unit_id as string | null) ?? null,
    startsAt: row.starts_at as Date,
    endsAt: row.ends_at as Date,
    status: row.status as AppointmentStatus,
    // ponytail: administrative_notes_ciphertext holds plaintext for now — no route
    // surfaces it back yet, encrypt with encryptField once one does.
    administrativeNote: (row.administrative_notes_ciphertext as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export class PgAppointmentRepository implements AppointmentRepository {
  constructor(private readonly pool: Pool) {}

  async hasConflict(doctorId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM appointments
       WHERE doctor_id = $1 AND status <> 'CANCELLED' AND starts_at < $3 AND $2 < ends_at
       LIMIT 1`,
      [doctorId, startsAt, endsAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async create(input: NewAppointmentRecord): Promise<AppointmentRecord> {
    const result = await this.pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, unit_id, starts_at, ends_at, administrative_notes_ciphertext, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.patientId, input.doctorId, input.unitId, input.startsAt, input.endsAt, input.administrativeNote, input.createdBy],
    );
    return mapAppointmentRow(result.rows[0]);
  }

  async findById(id: string): Promise<AppointmentRecord | undefined> {
    const result = await this.pool.query(`SELECT * FROM appointments WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? mapAppointmentRow(row) : undefined;
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<AppointmentRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE appointments SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, status],
    );
    const row = result.rows[0];
    return row ? mapAppointmentRow(row) : undefined;
  }

  async listByDateRange(from: Date, to: Date): Promise<AppointmentRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM appointments WHERE starts_at >= $1 AND starts_at < $2 ORDER BY starts_at`,
      [from, to],
    );
    return result.rows.map(mapAppointmentRow);
  }

  async listByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM appointments WHERE doctor_id = $1 AND starts_at >= $2 AND starts_at < $3 ORDER BY starts_at`,
      [doctorId, from, to],
    );
    return result.rows.map(mapAppointmentRow);
  }

  async listByPatientId(patientId: string): Promise<AppointmentRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM appointments WHERE patient_id = $1 ORDER BY starts_at DESC`,
      [patientId],
    );
    return result.rows.map(mapAppointmentRow);
  }
}
