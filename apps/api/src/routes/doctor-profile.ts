import { Router } from 'express';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import { decryptField, encryptField } from '../crypto/field-encryption.js';

export interface DoctorProfileRouterConfig {
  repository: DoctorRepository;
  fieldEncryptionKey: string;
}

// doctor_id comes from the authenticated JWT — mount behind requireAuth + requireRole('DOCTOR').
export function doctorProfileRouter(config: DoctorProfileRouterConfig): Router {
  const router = Router();

  // RF-03: view own profile, including approval status (supersedes the
  // unauthenticated GET /doctors/:id/approval-status for a logged-in doctor).
  router.get('/me', async (req, res) => {
    const doctor = await config.repository.findById(req.user!.sub);
    if (!doctor) {
      res.status(404).json({ code: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado.' });
      return;
    }

    res.json({
      id: doctor.id,
      full_name: doctor.fullName,
      email: doctor.email,
      specialty: doctor.specialty,
      license_state: doctor.licenseState,
      approval_status: doctor.approvalStatus,
      approval_reason: doctor.approvalReason,
      phone: doctor.phoneCiphertext ? decryptField(doctor.phoneCiphertext, config.fieldEncryptionKey) : null,
      address: doctor.addressCiphertext ? decryptField(doctor.addressCiphertext, config.fieldEncryptionKey) : null,
    });
  });

  // RF-03: full_name, phone and address are self-editable. License number,
  // license state and specialty follow the stricter admin-validated rules for
  // professional data and aren't touched here.
  // Home page queue switch: OPEN (green) / PAUSED (red); CLOSED until opened each day.
  router.get('/queue-status', async (req, res) => {
    res.json({ status: await config.repository.getQueueStatus(req.user!.sub) });
  });

  router.put('/queue-status', async (req, res) => {
    const { status } = req.body ?? {};
    if (status !== 'OPEN' && status !== 'PAUSED' && status !== 'CLOSED') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Status da fila deve ser OPEN, PAUSED ou CLOSED.' });
      return;
    }
    await config.repository.setQueueStatus(req.user!.sub, status);
    res.json({ status });
  });

  router.patch('/me', async (req, res) => {
    const { full_name, phone, address } = req.body ?? {};
    if (
      (full_name !== undefined && (typeof full_name !== 'string' || !full_name.trim())) ||
      (phone !== undefined && typeof phone !== 'string') ||
      (address !== undefined && typeof address !== 'string')
    ) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Campos inválidos.' });
      return;
    }

    const existing = await config.repository.findById(req.user!.sub);
    if (!existing) {
      res.status(404).json({ code: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado.' });
      return;
    }

    const updated = await config.repository.updateProfile(req.user!.sub, {
      fullName: typeof full_name === 'string' ? full_name.trim() : existing.fullName,
      phoneCiphertext: typeof phone === 'string' ? encryptField(phone, config.fieldEncryptionKey) : existing.phoneCiphertext,
      addressCiphertext:
        typeof address === 'string' ? encryptField(address, config.fieldEncryptionKey) : existing.addressCiphertext,
    });

    res.json({
      full_name: updated!.fullName,
      phone: updated!.phoneCiphertext ? decryptField(updated!.phoneCiphertext, config.fieldEncryptionKey) : null,
      address: updated!.addressCiphertext ? decryptField(updated!.addressCiphertext, config.fieldEncryptionKey) : null,
    });
  });

  return router;
}
