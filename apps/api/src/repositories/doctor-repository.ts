import { randomUUID } from 'node:crypto';

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

export interface DoctorRepository {
  existsByEmailOrLicenseHash(email: string, licenseHash: string): Promise<boolean>;
  create(record: NewDoctorRecord): Promise<DoctorRecord>;
  findById(id: string): Promise<DoctorRecord | undefined>;
  listPending(): Promise<DoctorRecord[]>;
  updateApproval(id: string, update: ApprovalUpdate): Promise<DoctorRecord | undefined>;
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

  async updateApproval(id: string, update: ApprovalUpdate): Promise<DoctorRecord | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: DoctorRecord = { ...existing, ...update };
    this.byId.set(id, updated);
    return updated;
  }
}
