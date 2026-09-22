import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { PatientRepository } from '../repositories/patient-repository.js';
import { publishAppointmentChange } from '../realtime/appointment-events.js';

export interface DoctorAppointmentsRouterConfig {
  appointmentRepository: AppointmentRepository;
  patientRepository: PatientRepository;
}

export function doctorAppointmentsRouter(config: DoctorAppointmentsRouterConfig): Router {
  const router = Router();

  // DOC-03: the doctor's queue for a given day (defaults to today).
  router.get('/', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const from = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date(new Date().toDateString());
    if (Number.isNaN(from.getTime())) {
      res.status(400).json({ code: 'INVALID_DATE', message: 'date deve estar no formato YYYY-MM-DD.' });
      return;
    }
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

    const appointments = await config.appointmentRepository.listByDoctorAndDateRange(req.user!.sub, from, to);
    const items = await Promise.all(
      appointments.map(async (appointment) => {
        const patient = await config.patientRepository.findById(appointment.patientId);
        return {
          id: appointment.id,
          patient: { id: appointment.patientId, display_name: patient?.fullName ?? 'Paciente removido' },
          starts_at: appointment.startsAt.toISOString(),
          ends_at: appointment.endsAt.toISOString(),
          status: appointment.status,
        };
      }),
    );
    res.json({ items });
  });

  // DOC-04: only the doctor linked to the appointment can start it, and only from CONFIRMED.
  router.post('/:appointmentId/start', async (req, res) => {
    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }

    if (appointment.doctorId !== req.user!.sub) {
      res.status(403).json({ code: 'RESOURCE_ACCESS_DENIED', message: 'Você não tem permissão para acessar este recurso.' });
      return;
    }

    if (appointment.status !== 'CONFIRMED') {
      res.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Não é possível iniciar uma consulta com status ${appointment.status}.`,
      });
      return;
    }

    const updated = await config.appointmentRepository.updateStatus(appointment.id, 'IN_PROGRESS');
    publishAppointmentChange({ appointmentId: updated!.id, doctorId: updated!.doctorId, status: updated!.status });
    res.json({ id: updated!.id, status: updated!.status });
  });

  return router;
}
