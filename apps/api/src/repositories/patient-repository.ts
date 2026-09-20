import { randomUUID } from 'node:crypto';

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

export interface PatientRepository {
  existsByEmailOrCpfHash(email: string, cpfHash: string): Promise<boolean>;
  create(record: NewPatientRecord): Promise<PatientRecord>;
  findById(id: string): Promise<PatientRecord | undefined>;
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
}
