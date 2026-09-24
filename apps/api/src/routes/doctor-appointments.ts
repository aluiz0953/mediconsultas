import { Router } from 'express';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { PatientRepository } from '../repositories/patient-repository.js';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import { publishAppointmentChange } from '../realtime/appointment-events.js';
import { hmacSha256Hex } from '../crypto/hmac.js';
import { normalizeCpf } from '../validation/cpf.js';

export interface DoctorAppointmentsRouterConfig {
  appointmentRepository: AppointmentRepository;
  patientRepository: PatientRepository;
  cpfHmacSecret: string;
  // When given, a PAUSED queue blocks starting new consultations.
  doctorRepository?: DoctorRepository;
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
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    // CPF is stored encrypted (never ILIKE-searchable), so a search hits it only
    // on an exact hash match — same technique as the uniqueness check at registration.
    const searchCpfHash = searchTerm.length > 0 ? hmacSha256Hex(normalizeCpf(searchTerm), config.cpfHmacSecret) : null;
    const searchNameNeedle = searchTerm.toLowerCase();

    const appointments = await config.appointmentRepository.listByDoctorAndDateRange(req.user!.sub, from, to);
    const enriched = await Promise.all(
      appointments.map(async (appointment) => ({
        appointment,
        patient: await config.patientRepository.findById(appointment.patientId),
      })),
    );

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
      .map(({ appointment, patient }) => ({
        id: appointment.id,
        patient: { id: appointment.patientId, display_name: patient?.fullName ?? 'Paciente removido' },
        starts_at: appointment.startsAt.toISOString(),
        ends_at: appointment.endsAt.toISOString(),
        status: appointment.status,
      }));
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

    if ((await config.doctorRepository?.getQueueStatus(req.user!.sub)) === 'PAUSED') {
      res.status(409).json({ code: 'QUEUE_PAUSED', message: 'Sua fila está pausada. Retome a fila para iniciar o atendimento.' });
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
