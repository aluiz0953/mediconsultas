import { Router } from 'express';
import type { DoctorScheduleBlockRepository } from '../repositories/doctor-schedule-block-repository.js';
import type { AppointmentRepository } from '../repositories/appointment-repository.js';
import type { AuditEventRepository } from '../repositories/audit-event-repository.js';

export interface SecretaryScheduleBlocksRouterConfig {
  blockRepository: DoctorScheduleBlockRepository;
  appointmentRepository: AppointmentRepository;
  auditEventRepository: AuditEventRepository;
}

// Blocks a time range on a doctor's calendar (holiday, day off, emergency)
// so the secretary can't accidentally schedule into it — distinct from
// marking an *existing* appointment DOCTOR_ABSENT after the fact.
export function secretaryScheduleBlocksRouter(config: SecretaryScheduleBlocksRouterConfig): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { doctor_id, date } = req.query;
    if (typeof doctor_id !== 'string' || !doctor_id) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'doctor_id é obrigatório.' });
      return;
    }

    const from = typeof date === 'string' ? new Date(`${date}T00:00:00`) : new Date(new Date().toDateString());
    if (Number.isNaN(from.getTime())) {
      res.status(400).json({ code: 'INVALID_DATE', message: 'date deve estar no formato YYYY-MM-DD.' });
      return;
    }
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

    const blocks = await config.blockRepository.listByDoctorAndDateRange(doctor_id, from, to);
    res.json({
      items: blocks.map((block) => ({
        id: block.id,
        starts_at: block.startsAt.toISOString(),
        ends_at: block.endsAt.toISOString(),
        reason: block.reason,
      })),
    });
  });

  router.post('/', async (req, res) => {
    const { doctor_id, starts_at, ends_at, reason } = req.body ?? {};
    if (typeof doctor_id !== 'string' || typeof starts_at !== 'string' || typeof ends_at !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'doctor_id, starts_at e ends_at são obrigatórios.' });
      return;
    }

    const startsAt = new Date(starts_at);
    const endsAt = new Date(ends_at);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
      res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'ends_at deve ser maior que starts_at.' });
      return;
    }

    // Don't silently strand an already-booked appointment inside the new block.
    const appointmentConflict = await config.appointmentRepository.hasConflict(doctor_id, startsAt, endsAt);
    if (appointmentConflict) {
      res.status(409).json({
        code: 'APPOINTMENT_IN_RANGE',
        message: 'Já existe uma consulta agendada neste intervalo. Cancele ou reagende antes de bloquear.',
      });
      return;
    }

    const blockConflict = await config.blockRepository.hasConflict(doctor_id, startsAt, endsAt);
    if (blockConflict) {
      res.status(409).json({ code: 'BLOCK_OVERLAPS', message: 'Este intervalo já está bloqueado.' });
      return;
    }

    const block = await config.blockRepository.create({
      doctorId: doctor_id,
      startsAt,
      endsAt,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
      createdBy: req.user?.sub ?? null,
    });

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'doctor_schedule_block.created',
      resourceType: 'doctor_schedule_block',
      resourceId: block.id,
      patientId: null,
      result: 'SUCCESS',
      reason: block.reason,
    });

    res.status(201).json({
      id: block.id,
      starts_at: block.startsAt.toISOString(),
      ends_at: block.endsAt.toISOString(),
      reason: block.reason,
    });
  });

  router.delete('/:blockId', async (req, res) => {
    const block = await config.blockRepository.findById(req.params.blockId);
    if (!block) {
      res.status(404).json({ code: 'BLOCK_NOT_FOUND', message: 'Bloqueio não encontrado.' });
      return;
    }

    await config.blockRepository.delete(block.id);

    await config.auditEventRepository.record({
      actorUserId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      action: 'doctor_schedule_block.removed',
      resourceType: 'doctor_schedule_block',
      resourceId: block.id,
      patientId: null,
      result: 'SUCCESS',
      reason: null,
    });

    res.status(204).end();
  });

  return router;
}
