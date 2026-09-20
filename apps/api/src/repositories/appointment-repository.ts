import { randomUUID } from 'node:crypto';

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
}
