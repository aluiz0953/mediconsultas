import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';

export interface PatientAppointmentsRouterConfig {
  appointmentRepository: AppointmentRepository;
  doctorRepository: DoctorRepository;
}

export function patientAppointmentsRouter(config: PatientAppointmentsRouterConfig): Router {
  const router = Router();

  // PAT-04: patient_id always comes from the JWT (req.user.sub), never the client.
  router.get('/', async (req, res) => {
    const appointments = await config.appointmentRepository.listByPatientId(req.user!.sub);
    const items = await Promise.all(
      appointments.map(async (appointment) => {
        const doctor = await config.doctorRepository.findById(appointment.doctorId);
        return {
          id: appointment.id,
          doctor: { id: appointment.doctorId, display_name: doctor?.fullName ?? 'Médico removido' },
          starts_at: appointment.startsAt.toISOString(),
          ends_at: appointment.endsAt.toISOString(),
          status: appointment.status,
        };
      }),
    );
    res.json({ items });
  });

  // PAT-05: same 404 whether the appointment doesn't exist or belongs to someone else.
  router.get('/:appointmentId', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment || appointment.patientId !== req.user!.sub) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }

    const doctor = await config.doctorRepository.findById(appointment.doctorId);
    res.json({
      id: appointment.id,
      doctor: { id: appointment.doctorId, display_name: doctor?.fullName ?? 'Médico removido' },
      starts_at: appointment.startsAt.toISOString(),
      ends_at: appointment.endsAt.toISOString(),
      status: appointment.status,
    });
  });

  return router;
}
