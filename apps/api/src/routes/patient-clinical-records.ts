import { Router } from 'express';
import type { ClinicalRecordRepository } from '../repositories/clinical-record-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import { decryptField } from '../crypto/field-encryption.js';
import type { ClinicalRecordContent } from './clinical-records.js';

export interface PatientClinicalRecordsRouterConfig {
  clinicalRecordRepository: ClinicalRecordRepository;
  doctorRepository: DoctorRepository;
  fieldEncryptionKey: string;
}

// patient_id is derived from the authenticated JWT (req.user.sub) — this
// router must always be mounted behind requireAuth + requireRole('PATIENT').
export function patientClinicalRecordsRouter(config: PatientClinicalRecordsRouterConfig): Router {
  const router = Router();

  // PAT-06: list only finalized + released records — drafts never reach the patient.
  router.get('/', async (req, res) => {
    const patientId = req.user!.sub;
    const records = await config.clinicalRecordRepository.listReleasedByPatientId(patientId);
    const items = await Promise.all(
      records.map(async (record) => {
        const doctor = await config.doctorRepository.findById(record.doctorId);
        return {
          id: record.id,
          version: record.version,
          doctor: doctor ? { id: doctor.id, display_name: doctor.fullName } : null,
          finalized_at: record.finalizedAt?.toISOString() ?? null,
          released_at: record.releasedAt?.toISOString() ?? null,
        };
      }),
    );
    res.json({ items });
  });

  // PAT-06: view one released record, read-only, with the decrypted clinical content.
  router.get('/:recordId', async (req, res) => {
    const patientId = req.user!.sub;

    const record = await config.clinicalRecordRepository.findById(req.params.recordId);
    // Same 404 whether it doesn't exist, belongs to someone else, or isn't released yet — no enumeration.
    if (!record || record.patientId !== patientId || record.status !== 'FINALIZED' || !record.releasedAt) {
      res.status(404).json({ code: 'CLINICAL_RECORD_NOT_FOUND', message: 'Registro clínico não encontrado.' });
      return;
    }

    const doctor = await config.doctorRepository.findById(record.doctorId);
    const content = JSON.parse(decryptField(record.contentCiphertext, config.fieldEncryptionKey)) as ClinicalRecordContent;

    res.json({
      id: record.id,
      version: record.version,
      doctor: doctor ? { id: doctor.id, display_name: doctor.fullName } : null,
      finalized_at: record.finalizedAt?.toISOString() ?? null,
      released_at: record.releasedAt.toISOString(),
      content,
    });
  });

  return router;
}
