import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { PatientRepository } from '../repositories/patient-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';

export interface SecretaryAppointmentsRouterConfig {
  appointmentRepository: AppointmentRepository;
  patientRepository: PatientRepository;
  doctorRepository: DoctorRepository;
}

export function secretaryAppointmentsRouter(config: SecretaryAppointmentsRouterConfig): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { patient_id, doctor_id, unit_id, starts_at, ends_at, administrative_note, created_by } = req.body ?? {};

    if (
      typeof patient_id !== 'string' ||
      typeof doctor_id !== 'string' ||
      typeof starts_at !== 'string' ||
      typeof ends_at !== 'string'
    ) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'patient_id, doctor_id, starts_at e ends_at são obrigatórios.' });
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

    const appointment = await config.appointmentRepository.create({
      patientId: patient_id,
      doctorId: doctor_id,
      unitId: typeof unit_id === 'string' ? unit_id : null,
      startsAt,
      endsAt,
      administrativeNote: typeof administrative_note === 'string' ? administrative_note : null,
      createdBy: typeof created_by === 'string' ? created_by : null,
    });

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

  return router;
}
