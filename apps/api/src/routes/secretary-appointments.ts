import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { PatientRepository } from '../repositories/patient-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import type { DoctorScheduleBlockRepository } from '../repositories/doctor-schedule-block-repository.js';
import { publishAppointmentChange } from '../realtime/appointment-events.js';
import { hmacSha256Hex } from '../crypto/hmac.js';
import { normalizeCpf } from '../validation/cpf.js';

export interface SecretaryAppointmentsRouterConfig {
  appointmentRepository: AppointmentRepository;
  patientRepository: PatientRepository;
  doctorRepository: DoctorRepository;
  blockRepository: DoctorScheduleBlockRepository;
  cpfHmacSecret: string;
}

export function secretaryAppointmentsRouter(config: SecretaryAppointmentsRouterConfig): Router {
  const router = Router();

  // Picker data for the scheduling form: only the fields the secretary needs
  // (RF §4.1 — secretary gets what's necessary for agenda management, nothing clinical).
  router.get('/doctors', async (_req, res) => {
    const doctors = await config.doctorRepository.listApproved();
    res.json({
      items: await Promise.all(
        doctors.map(async (doctor) => ({
          id: doctor.id,
          full_name: doctor.fullName,
          license_state: doctor.licenseState,
          specialty: doctor.specialty,
          // The doctor's queue switch for today (CLOSED / OPEN / PAUSED).
          queue_status: await config.doctorRepository.getQueueStatus(doctor.id),
        })),
      ),
    });
  });

  router.get('/patients', async (req, res) => {
    const query = typeof req.query.search === 'string' ? req.query.search : '';
    const patients = await config.patientRepository.search(query);
    res.json({
      items: patients.map((patient) => ({ id: patient.id, full_name: patient.fullName })),
    });
  });

  // Agenda view for a single day; defaults to today when no `date` is given.
  router.get('/', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const from = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date(new Date().toDateString());
    if (Number.isNaN(from.getTime())) {
      res.status(400).json({ code: 'INVALID_DATE', message: 'date deve estar no formato YYYY-MM-DD.' });
      return;
    }
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    // CPF is stored encrypted (never ILIKE-searchable), so a search hits it only
    // on an exact hash match — same technique as the uniqueness check at registration.
    const searchCpfHash = searchTerm.length > 0 ? hmacSha256Hex(normalizeCpf(searchTerm), config.cpfHmacSecret) : null;
    const searchNameNeedle = searchTerm.toLowerCase();

    const appointments = await config.appointmentRepository.listByDateRange(from, to);
    const [patients, doctors] = await Promise.all([
      config.patientRepository.findByIds(appointments.map((a) => a.patientId)),
      config.doctorRepository.findByIds(appointments.map((a) => a.doctorId)),
    ]);
    const enriched = appointments.map((appointment) => ({
      appointment,
      patient: patients.get(appointment.patientId),
      doctor: doctors.get(appointment.doctorId),
    }));

    const items = enriched
      .filter(({ appointment, patient }) => {
        if (statusFilter && appointment.status !== statusFilter) return false;
        if (searchTerm) {
          const nameMatch = patient?.fullName.toLowerCase().includes(searchNameNeedle) ?? false;
          const cpfMatch = patient?.cpfHash === searchCpfHash;
          if (!nameMatch && !cpfMatch) return false;
        }
        return true;
      })
      .map(({ appointment, patient, doctor }) => ({
        id: appointment.id,
        patient: { id: appointment.patientId, display_name: patient?.fullName ?? 'Paciente removido' },
        doctor: { id: appointment.doctorId, display_name: doctor?.fullName ?? 'Médico removido' },
        starts_at: appointment.startsAt.toISOString(),
        ends_at: appointment.endsAt.toISOString(),
        status: appointment.status,
      }));
    res.json({ items });
  });

  router.post('/', async (req, res) => {
    const { patient_id, doctor_id, unit_id, starts_at, ends_at, administrative_note } = req.body ?? {};

    if (
      typeof patient_id !== 'string' ||
      typeof doctor_id !== 'string' ||
      typeof starts_at !== 'string' ||
      typeof ends_at !== 'string'
    ) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'patient_id, doctor_id, starts_at e ends_at são obrigatórios.',
      });
      return;
    }

    const startsAt = new Date(starts_at);
    const endsAt = new Date(ends_at);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
      res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'starts_at/ends_at inválidos: ends_at deve ser maior que starts_at.' });
      return;
    }

    const patient = await config.patientRepository.findById(patient_id);
    if (!patient) {
      res.status(404).json({ code: 'PATIENT_NOT_FOUND', message: 'Paciente não encontrado.' });
      return;
    }

    const doctor = await config.doctorRepository.findById(doctor_id);
    if (!doctor) {
      res.status(404).json({ code: 'DOCTOR_NOT_FOUND', message: 'Médico não encontrado.' });
      return;
    }
    // SEC-04: revalidate doctor's approval status at write time, not just at read time.
    if (doctor.approvalStatus !== 'APPROVED') {
      res.status(409).json({ code: 'DOCTOR_NOT_AVAILABLE', message: 'Médico não está habilitado para atendimento.' });
      return;
    }

    // RN-04: no double-booking the same doctor.
    const conflict = await config.appointmentRepository.hasConflict(doctor_id, startsAt, endsAt);
    if (conflict) {
      res.status(409).json({ code: 'APPOINTMENT_SLOT_UNAVAILABLE', message: 'Horário indisponível para este médico.' });
      return;
    }

    // Secretary-blocked interval (holiday, day off, emergency) — see secretary-schedule-blocks.ts.
    const blocked = await config.blockRepository.hasConflict(doctor_id, startsAt, endsAt);
    if (blocked) {
      res.status(409).json({ code: 'DOCTOR_TIME_BLOCKED', message: 'Este horário está bloqueado na agenda do médico.' });
      return;
    }

    const appointment = await config.appointmentRepository.create({
      patientId: patient_id,
      doctorId: doctor_id,
      unitId: typeof unit_id === 'string' ? unit_id : null,
      startsAt,
      endsAt,
      administrativeNote: typeof administrative_note === 'string' ? administrative_note : null,
      createdBy: req.user?.sub ?? null,
    });
    publishAppointmentChange({ appointmentId: appointment.id, doctorId: appointment.doctorId, status: appointment.status });

    res.status(201).json({
      id: appointment.id,
      patient: { id: patient.id, display_name: patient.fullName },
      doctor: { id: doctor.id, display_name: doctor.fullName },
      starts_at: appointment.startsAt.toISOString(),
      ends_at: appointment.endsAt.toISOString(),
      status: appointment.status,
      created_at: appointment.createdAt.toISOString(),
    });
  });

  // SEC-05: only a SCHEDULED appointment can be confirmed.
  router.post('/:appointmentId/confirm', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }
    if (appointment.status !== 'SCHEDULED') {
      res.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Não é possível confirmar uma consulta com status ${appointment.status}.`,
      });
      return;
    }

    const updated = await config.appointmentRepository.updateStatus(appointment.id, 'CONFIRMED');
    publishAppointmentChange({ appointmentId: updated!.id, doctorId: updated!.doctorId, status: updated!.status });
    res.json({ id: updated!.id, status: updated!.status });
  });

  // Only appointments that haven't started clinically yet can still be cancelled from the front desk.
  router.post('/:appointmentId/cancel', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }
    if (appointment.status !== 'SCHEDULED' && appointment.status !== 'CONFIRMED') {
      res.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Não é possível cancelar uma consulta com status ${appointment.status}.`,
      });
      return;
    }

    const updated = await config.appointmentRepository.updateStatus(appointment.id, 'CANCELLED');
    publishAppointmentChange({ appointmentId: updated!.id, doctorId: updated!.doctorId, status: updated!.status });
    res.json({ id: updated!.id, status: updated!.status });
  });

  return router;
}
