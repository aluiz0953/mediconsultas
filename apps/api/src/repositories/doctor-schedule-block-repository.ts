import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface DoctorScheduleBlockRecord {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export type NewDoctorScheduleBlock = Omit<DoctorScheduleBlockRecord, 'id' | 'createdAt'>;

export interface DoctorScheduleBlockRepository {
  hasConflict(doctorId: string, startsAt: Date, endsAt: Date): Promise<boolean>;
  create(block: NewDoctorScheduleBlock): Promise<DoctorScheduleBlockRecord>;
  findById(id: string): Promise<DoctorScheduleBlockRecord | undefined>;
  listByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<DoctorScheduleBlockRecord[]>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryDoctorScheduleBlockRepository implements DoctorScheduleBlockRepository {
  private readonly byId = new Map<string, DoctorScheduleBlockRecord>();

  async hasConflict(doctorId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    return [...this.byId.values()].some(
      (block) =>
        block.doctorId === doctorId &&
        block.startsAt.getTime() < endsAt.getTime() &&
        startsAt.getTime() < block.endsAt.getTime(),
    );
  }

  async create(input: NewDoctorScheduleBlock): Promise<DoctorScheduleBlockRecord> {
    const record: DoctorScheduleBlockRecord = { ...input, id: randomUUID(), createdAt: new Date() };
    this.byId.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<DoctorScheduleBlockRecord | undefined> {
    return this.byId.get(id);
  }

  async listByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<DoctorScheduleBlockRecord[]> {
    return [...this.byId.values()]
      .filter(
        (block) =>
          block.doctorId === doctorId && block.startsAt.getTime() < to.getTime() && block.endsAt.getTime() > from.getTime(),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async delete(id: string): Promise<boolean> {
    return this.byId.delete(id);
  }
}

function mapRow(row: Record<string, unknown>): DoctorScheduleBlockRecord {
  return {
    id: row.id as string,
    doctorId: row.doctor_id as string,
    startsAt: row.starts_at as Date,
    endsAt: row.ends_at as Date,
    reason: (row.reason as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export class PgDoctorScheduleBlockRepository implements DoctorScheduleBlockRepository {
  constructor(private readonly pool: Pool) {}

  async hasConflict(doctorId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM doctor_schedule_blocks WHERE doctor_id = $1 AND starts_at < $3 AND $2 < ends_at LIMIT 1`,
      [doctorId, startsAt, endsAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async create(input: NewDoctorScheduleBlock): Promise<DoctorScheduleBlockRecord> {
    const result = await this.pool.query(
      `INSERT INTO doctor_schedule_blocks (doctor_id, starts_at, ends_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.doctorId, input.startsAt, input.endsAt, input.reason, input.createdBy],
    );
    return mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<DoctorScheduleBlockRecord | undefined> {
    const result = await this.pool.query(`SELECT * FROM doctor_schedule_blocks WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async listByDoctorAndDateRange(doctorId: string, from: Date, to: Date): Promise<DoctorScheduleBlockRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM doctor_schedule_blocks WHERE doctor_id = $1 AND starts_at < $3 AND ends_at > $2 ORDER BY starts_at`,
      [doctorId, from, to],
    );
    return result.rows.map(mapRow);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM doctor_schedule_blocks WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
