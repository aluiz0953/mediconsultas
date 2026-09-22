import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { ClinicalRecordRepository } from '../repositories/clinical-record-repository.js';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import type { PatientRepository } from '../repositories/patient-repository.js';
import type { ClinicSettingsRepository } from '../repositories/clinic-settings-repository.js';
import { encryptField, decryptField } from '../crypto/field-encryption.js';
import { renderClinicalRecordPdf } from '../pdf/clinical-record-pdf.js';

export interface ClinicalRecordContent {
  chief_complaint?: string;
  assessment?: string;
  instructions?: string;
  conduct?: string;
  medications?: string;
  recommended_exams?: string;
  notes?: string;
}

const CONTENT_KEYS = [
  'chief_complaint',
  'assessment',
  'instructions',
  'conduct',
  'medications',
  'recommended_exams',
  'notes',
] as const satisfies readonly (keyof ClinicalRecordContent)[];

function extractContent(body: unknown): ClinicalRecordContent {
  const content: ClinicalRecordContent = {};
  if (body && typeof body === 'object') {
    for (const key of CONTENT_KEYS) {
      const value = (body as Record<string, unknown>)[key];
      if (typeof value === 'string') content[key] = value;
    }
  }
  return content;
}

export interface ClinicalRecordsRouterConfig {
  appointmentRepository: AppointmentRepository;
  clinicalRecordRepository: ClinicalRecordRepository;
  auditEventRepository: AuditEventRepository;
  doctorRepository: DoctorRepository;
  patientRepository: PatientRepository;
  clinicSettingsRepository: ClinicSettingsRepository;
  fieldEncryptionKey: string;
}

export function clinicalRecordsRouter(config: ClinicalRecordsRouterConfig): Router {
  const router = Router();

  // DOC-05: fetch the existing draft/finalized record for an appointment, if any.
  router.get('/appointments/:appointmentId/clinical-record', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }
    if (appointment.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }

    const record = await config.clinicalRecordRepository.findByAppointmentId(appointment.id);
    if (!record) {
      res.status(404).json({ code: 'CLINICAL_RECORD_NOT_FOUND', message: 'Nenhum registro clínico para esta consulta ainda.' });
      return;
    }

    const content = JSON.parse(decryptField(record.contentCiphertext, config.fieldEncryptionKey)) as ClinicalRecordContent;
    res.json({ id: record.id, version: record.version, status: record.status, content });
  });

  // DOC-05: open a draft clinical record for an in-progress appointment linked to this doctor.
  router.post('/appointments/:appointmentId/clinical-records', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }
    if (appointment.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }
    if (appointment.status !== 'IN_PROGRESS') {
      res.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Só é possível abrir um registro clínico com a consulta em atendimento (status atual: ${appointment.status}).`,
      });
      return;
    }

    const existing = await config.clinicalRecordRepository.findByAppointmentId(appointment.id);
    if (existing) {
      res.status(409).json({ code: 'CLINICAL_RECORD_ALREADY_EXISTS', message: 'Já existe um registro clínico para esta consulta.' });
      return;
    }

    const content = extractContent(req.body);
    const record = await config.clinicalRecordRepository.create({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      contentCiphertext: encryptField(JSON.stringify(content), config.fieldEncryptionKey),
    });

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'clinical_record.created',
      resourceType: 'clinical_record',
      resourceId: record.id,
      patientId: record.patientId,
      result: 'SUCCESS',
      reason: null,
    });

    res.status(201).json({ id: record.id, version: record.version, status: record.status });
  });

  // DOC-05: edit the draft — no-op once finalized.
  router.patch('/clinical-records/:recordId', async (req, res) => {
    const record = await config.clinicalRecordRepository.findById(req.params.recordId);
    if (!record) {
      res.status(404).json({ code: 'CLINICAL_RECORD_NOT_FOUND', message: 'Registro clínico não encontrado.' });
      return;
    }
    if (record.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }
    if (record.status !== 'DRAFT') {
      res.status(409).json({ code: 'RECORD_NOT_EDITABLE', message: 'Só é possível editar um registro em rascunho.' });
      return;
    }

    const previous = JSON.parse(decryptField(record.contentCiphertext, config.fieldEncryptionKey)) as ClinicalRecordContent;
    const merged = { ...previous, ...extractContent(req.body) };
    const updated = await config.clinicalRecordRepository.updateContent(
      record.id,
      encryptField(JSON.stringify(merged), config.fieldEncryptionKey),
    );

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'clinical_record.updated',
      resourceType: 'clinical_record',
      resourceId: updated!.id,
      patientId: record.patientId,
      result: 'SUCCESS',
      reason: null,
    });

    res.json({ id: updated!.id, version: updated!.version, status: updated!.status });
  });

  // DOC-05/RF-08: finalize creates an immutable version; release_to_patient mirrors PRD §22.2.
  router.post('/clinical-records/:recordId/finalize', async (req, res) => {
    const { release_to_patient } = req.body ?? {};

    const record = await config.clinicalRecordRepository.findById(req.params.recordId);
    if (!record) {
      res.status(404).json({ code: 'CLINICAL_RECORD_NOT_FOUND', message: 'Registro clínico não encontrado.' });
      return;
    }
    if (record.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }
    if (record.status !== 'DRAFT') {
      res.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Não é possível finalizar um registro com status ${record.status}.`,
      });
      return;
    }

    const content = JSON.parse(decryptField(record.contentCiphertext, config.fieldEncryptionKey)) as ClinicalRecordContent;
    if (!content.assessment?.trim() || !content.instructions?.trim()) {
      res.status(400).json({
        code: 'INCOMPLETE_CLINICAL_RECORD',
        message: 'Avaliação clínica e orientações ao paciente são obrigatórias para finalizar.',
      });
      return;
    }

    const now = new Date();
    const updated = await config.clinicalRecordRepository.finalize(record.id, {
      finalizedAt: now,
      releasedAt: release_to_patient === true ? now : null,
    });

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'clinical_record.finalized',
      resourceType: 'clinical_record',
      resourceId: updated!.id,
      patientId: record.patientId,
      result: 'SUCCESS',
      reason: null,
    });

    res.json({
      id: updated!.id,
      version: updated!.version,
      status: updated!.status,
      released_at: updated!.releasedAt?.toISOString() ?? null,
      content: { available: true },
    });
  });

  // RF-08: printable PDF of a finalized record, for the issuing doctor.
  router.get('/clinical-records/:recordId/pdf', async (req, res) => {
    const record = await config.clinicalRecordRepository.findById(req.params.recordId);
    if (!record || record.status !== 'FINALIZED') {
      res.status(404).json({ code: 'CLINICAL_RECORD_NOT_FOUND', message: 'Registro não encontrado ou não finalizado.' });
      return;
    }
    if (record.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }

    const [doctor, patient, clinicSettings] = await Promise.all([
      config.doctorRepository.findById(record.doctorId),
      config.patientRepository.findById(record.patientId),
      config.clinicSettingsRepository.get(),
    ]);
    const content = JSON.parse(decryptField(record.contentCiphertext, config.fieldEncryptionKey)) as ClinicalRecordContent;
    const licenseNumber = doctor ? decryptField(doctor.licenseNumberCiphertext, config.fieldEncryptionKey) : 'N/D';

    renderClinicalRecordPdf(res, {
      recordId: record.id,
      version: record.version,
      finalizedAt: record.finalizedAt,
      patientName: patient?.fullName ?? 'Paciente',
      doctorName: doctor?.fullName ?? 'Médico(a)',
      doctorLicense: `CRM ${licenseNumber}/${doctor?.licenseState ?? 'N/D'}`,
      content,
      logoBuffer: clinicSettings.logoBase64 ? Buffer.from(clinicSettings.logoBase64, 'base64') : null,
    });
  });

  return router;
}
