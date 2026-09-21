import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { PrescriptionItem, PrescriptionRepository } from '../repositories/prescription-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import { decryptField } from '../crypto/field-encryption.js';
import { renderPrescriptionPdf } from '../pdf/prescription-pdf.js';

export interface PrescriptionsRouterConfig {
  appointmentRepository: AppointmentRepository;
  prescriptionRepository: PrescriptionRepository;
  doctorRepository: DoctorRepository;
  fieldEncryptionKey: string;
}

function parseItems(body: unknown): PrescriptionItem[] | null {
  const raw = (body as Record<string, unknown> | null | undefined)?.items;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;

  const items: PrescriptionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.medication_name !== 'string' || !e.medication_name.trim()) return null;

    items.push({
      medicationName: e.medication_name.trim(),
      strength: typeof e.strength === 'string' ? e.strength : undefined,
      presentation: typeof e.presentation === 'string' ? e.presentation : undefined,
      dosage: typeof e.dosage === 'string' ? e.dosage : undefined,
      frequency: typeof e.frequency === 'string' ? e.frequency : undefined,
      duration: typeof e.duration === 'string' ? e.duration : undefined,
      quantity: typeof e.quantity === 'string' ? e.quantity : undefined,
      instructions: typeof e.instructions === 'string' ? e.instructions : undefined,
    });
  }
  return items;
}

function serializeItems(items: PrescriptionItem[]) {
  return items.map((item) => ({
    medication_name: item.medicationName,
    strength: item.strength ?? null,
    presentation: item.presentation ?? null,
    dosage: item.dosage ?? null,
    frequency: item.frequency ?? null,
    duration: item.duration ?? null,
    quantity: item.quantity ?? null,
    instructions: item.instructions ?? null,
  }));
}

export function prescriptionsRouter(config: PrescriptionsRouterConfig): Router {
  const router = Router();

  // DOC-06: fetch the existing draft/finalized prescription for an appointment, if any.
  router.get('/appointments/:appointmentId/prescription', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }
    if (appointment.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }

    const record = await config.prescriptionRepository.findByAppointmentId(appointment.id);
    if (!record) {
      res.status(404).json({ code: 'PRESCRIPTION_NOT_FOUND', message: 'Nenhuma receita para esta consulta ainda.' });
      return;
    }

    res.json({
      id: record.id,
      version: record.version,
      status: record.status,
      no_medication_needed: record.noMedicationNeeded,
      items: serializeItems(record.items),
    });
  });

  // DOC-06: open a draft prescription for an in-progress appointment linked to this doctor.
  router.post('/appointments/:appointmentId/prescriptions', async (req, res) => {
    const { no_medication_needed } = req.body ?? {};

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
        message: `Só é possível abrir uma receita com a consulta em atendimento (status atual: ${appointment.status}).`,
      });
      return;
    }

    const existing = await config.prescriptionRepository.findByAppointmentId(appointment.id);
    if (existing) {
      res.status(409).json({ code: 'PRESCRIPTION_ALREADY_EXISTS', message: 'Já existe uma receita para esta consulta.' });
      return;
    }

    const items = parseItems(req.body);
    if (items === null) {
      res.status(400).json({ code: 'INVALID_ITEMS', message: 'Cada item precisa de medication_name.' });
      return;
    }

    const record = await config.prescriptionRepository.create({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      items,
      noMedicationNeeded: no_medication_needed === true,
    });

    res.status(201).json({ id: record.id, version: record.version, status: record.status });
  });

  // DOC-06: edit the draft's items.
  router.patch('/prescriptions/:prescriptionId', async (req, res) => {
    const { no_medication_needed } = req.body ?? {};

    const record = await config.prescriptionRepository.findById(req.params.prescriptionId);
    if (!record) {
      res.status(404).json({ code: 'PRESCRIPTION_NOT_FOUND', message: 'Receita não encontrada.' });
      return;
    }
    if (record.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }
    if (record.status !== 'DRAFT') {
      res.status(409).json({ code: 'PRESCRIPTION_NOT_EDITABLE', message: 'Só é possível editar uma receita em rascunho.' });
      return;
    }

    const items = parseItems(req.body);
    if (items === null) {
      res.status(400).json({ code: 'INVALID_ITEMS', message: 'Cada item precisa de medication_name.' });
      return;
    }

    const updated = await config.prescriptionRepository.updateItems(
      record.id,
      items.length > 0 ? items : record.items,
      typeof no_medication_needed === 'boolean' ? no_medication_needed : record.noMedicationNeeded,
    );

    res.json({ id: updated!.id, version: updated!.version, status: updated!.status });
  });

  // DOC-06: finalize creates an immutable version — needs at least one item, or an explicit "not needed".
  router.post('/prescriptions/:prescriptionId/finalize', async (req, res) => {
    const record = await config.prescriptionRepository.findById(req.params.prescriptionId);
    if (!record) {
      res.status(404).json({ code: 'PRESCRIPTION_NOT_FOUND', message: 'Receita não encontrada.' });
      return;
    }
    if (record.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }
    if (record.status !== 'DRAFT') {
      res.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Não é possível finalizar uma receita com status ${record.status}.`,
      });
      return;
    }
    if (!record.noMedicationNeeded && record.items.length === 0) {
      res.status(400).json({
        code: 'PRESCRIPTION_REQUIRES_ITEMS',
        message: 'A receita precisa de ao menos um item ou ser marcada como não necessária.',
      });
      return;
    }

    const updated = await config.prescriptionRepository.finalize(record.id, new Date());
    res.json({
      id: updated!.id,
      version: updated!.version,
      status: updated!.status,
      issued_at: updated!.issuedAt?.toISOString() ?? null,
    });
  });

  // RF-09: printable PDF of a finalized prescription, for the issuing doctor.
  router.get('/prescriptions/:prescriptionId/pdf', async (req, res) => {
    const record = await config.prescriptionRepository.findById(req.params.prescriptionId);
    if (!record || record.status !== 'FINALIZED') {
      res.status(404).json({ code: 'PRESCRIPTION_NOT_FOUND', message: 'Receita não encontrada ou não finalizada.' });
      return;
    }
    if (record.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }

    const doctor = await config.doctorRepository.findById(record.doctorId);
    const licenseNumber = doctor ? decryptField(doctor.licenseNumberCiphertext, config.fieldEncryptionKey) : 'N/D';

    renderPrescriptionPdf(res, {
      prescriptionId: record.id,
      issuedAt: record.issuedAt,
      items: record.items,
      noMedicationNeeded: record.noMedicationNeeded,
      doctorName: doctor?.fullName ?? 'Médico(a)',
      doctorLicense: `CRM ${licenseNumber}/${doctor?.licenseState ?? 'N/D'}`,
    });
  });

  return router;
}
