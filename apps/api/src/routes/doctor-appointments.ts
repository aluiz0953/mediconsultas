import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';

export interface DoctorAppointmentsRouterConfig {
  appointmentRepository: AppointmentRepository;
}

export function doctorAppointmentsRouter(config: DoctorAppointmentsRouterConfig): Router {
  const router = Router();

  // DOC-04: only the doctor linked to the appointment can start it, and only
  // from CONFIRMED. `doctor_id` comes from the body until an auth middleware
  // exists to derive it from the JWT (req.user.sub) instead.
  router.post('/:appointmentId/start', async (req, res) => {
    const { doctor_id } = req.body ?? {};
    if (typeof doctor_id !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'doctor_id é obrigatório.' });
      return;
    }

    const appointment = await config.appointmentRepository.findById(req.params.appointmentId);
    if (!appointment) {
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Consulta não encontrada.' });
      return;
    }

    if (appointment.doctorId !== doctor_id) {
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
    res.json({ id: updated!.id, status: updated!.status });
  });

  return router;
}
