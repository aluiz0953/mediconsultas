import { Router } from 'express';
import type { DoctorRepository } from '../repositories/doctor-repository.js';

export interface AdminDoctorsRouterConfig {
  repository: DoctorRepository;
}

export function adminDoctorsRouter(config: AdminDoctorsRouterConfig): Router {
  const router = Router();

  router.get('/pending', async (_req, res) => {
    const pending = await config.repository.listPending();
    res.json({
      items: pending.map((doctor) => ({
        id: doctor.id,
        full_name: doctor.fullName,
        license_state: doctor.licenseState,
        specialty: doctor.specialty,
        created_at: doctor.createdAt,
      })),
    });
  });

  router.post('/:doctorId/approve', async (req, res) => {
    const updated = await config.repository.updateApproval(req.params.doctorId, {
      approvalStatus: 'APPROVED',
      approvalReason: null,
      approvedBy: req.user?.sub ?? null,
      approvedAt: new Date(),
    });

    if (!updated) {
      res.status(404).json({ code: 'DOCTOR_NOT_FOUND', message: 'Médico não encontrado.' });
      return;
    }
    res.json({ id: updated.id, status: updated.approvalStatus });
  });

  router.post('/:doctorId/reject', async (req, res) => {
    const { reason } = req.body ?? {};
    if (typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ code: 'REASON_REQUIRED', message: 'Justificativa é obrigatória para rejeitar.' });
      return;
    }

    const updated = await config.repository.updateApproval(req.params.doctorId, {
      approvalStatus: 'REJECTED',
      approvalReason: reason.trim(),
      approvedBy: req.user?.sub ?? null,
      approvedAt: new Date(),
    });

    if (!updated) {
      res.status(404).json({ code: 'DOCTOR_NOT_FOUND', message: 'Médico não encontrado.' });
      return;
    }
    res.json({ id: updated.id, status: updated.approvalStatus, reason: updated.approvalReason });
  });

  return router;
}
