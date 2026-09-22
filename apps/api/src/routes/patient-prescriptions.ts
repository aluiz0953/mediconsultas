import { Router } from 'express';
import type { PrescriptionRepository } from '../repositories/prescription-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import type { ClinicSettingsRepository } from '../repositories/clinic-settings-repository.js';
import { decryptField } from '../crypto/field-encryption.js';
import { renderPrescriptionPdf } from '../pdf/prescription-pdf.js';

export interface PatientPrescriptionsRouterConfig {
  prescriptionRepository: PrescriptionRepository;
  doctorRepository: DoctorRepository;
  clinicSettingsRepository: ClinicSettingsRepository;
  fieldEncryptionKey: string;
}

// patient_id is derived from the authenticated JWT (req.user.sub) — this
// router must always be mounted behind requireAuth + requireRole('PATIENT').
export function patientPrescriptionsRouter(config: PatientPrescriptionsRouterConfig): Router {
  const router = Router();

  // PAT-07: list only finalized prescriptions — a prescription has no separate
  // release step, finalize is what makes it visible to the patient.
  router.get('/', async (req, res) => {
    const patientId = req.user!.sub;
    const prescriptions = await config.prescriptionRepository.listFinalizedByPatientId(patientId);
    const items = await Promise.all(
      prescriptions.map(async (prescription) => {
        const doctor = await config.doctorRepository.findById(prescription.doctorId);
        return {
          id: prescription.id,
          version: prescription.version,
          doctor: doctor ? { id: doctor.id, display_name: doctor.fullName } : null,
          issued_at: prescription.issuedAt?.toISOString() ?? null,
          no_medication_needed: prescription.noMedicationNeeded,
        };
      }),
    );
    res.json({ items });
  });

  // PAT-07: view one finalized prescription, read-only.
  router.get('/:prescriptionId', async (req, res) => {
    const patientId = req.user!.sub;

    const record = await config.prescriptionRepository.findById(req.params.prescriptionId);
    if (!record || record.patientId !== patientId || record.status !== 'FINALIZED') {
      res.status(404).json({ code: 'PRESCRIPTION_NOT_FOUND', message: 'Receita não encontrada.' });
      return;
    }

    const doctor = await config.doctorRepository.findById(record.doctorId);
    res.json({
      id: record.id,
      version: record.version,
      doctor: doctor ? { id: doctor.id, display_name: doctor.fullName } : null,
      issued_at: record.issuedAt?.toISOString() ?? null,
      no_medication_needed: record.noMedicationNeeded,
      items: record.items.map((item) => ({
        medication_name: item.medicationName,
        strength: item.strength ?? null,
        presentation: item.presentation ?? null,
        dosage: item.dosage ?? null,
        frequency: item.frequency ?? null,
        duration: item.duration ?? null,
        quantity: item.quantity ?? null,
        instructions: item.instructions ?? null,
      })),
    });
  });

  // RF-09: printable PDF of a finalized prescription, for the patient it belongs to.
  router.get('/:prescriptionId/pdf', async (req, res) => {
    const patientId = req.user!.sub;

    const record = await config.prescriptionRepository.findById(req.params.prescriptionId);
    if (!record || record.patientId !== patientId || record.status !== 'FINALIZED') {
      res.status(404).json({ code: 'PRESCRIPTION_NOT_FOUND', message: 'Receita não encontrada.' });
      return;
    }

    const [doctor, clinicSettings] = await Promise.all([
      config.doctorRepository.findById(record.doctorId),
      config.clinicSettingsRepository.get(),
    ]);
    const licenseNumber = doctor ? decryptField(doctor.licenseNumberCiphertext, config.fieldEncryptionKey) : 'N/D';

    renderPrescriptionPdf(res, {
      prescriptionId: record.id,
      issuedAt: record.issuedAt,
      items: record.items,
      noMedicationNeeded: record.noMedicationNeeded,
      doctorName: doctor?.fullName ?? 'Médico(a)',
      doctorLicense: `CRM ${licenseNumber}/${doctor?.licenseState ?? 'N/D'}`,
      logoBuffer: clinicSettings.logoBase64 ? Buffer.from(clinicSettings.logoBase64, 'base64') : null,
    });
  });

  return router;
}
