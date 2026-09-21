import { Router } from 'express';
import type { DoctorRepository } from '../repositories/doctor-repository.js';
import { hashPassword } from '../auth/password.js';
import { isStrongPassword } from '../validation/password-policy.js';
import { isValidBrazilianUf } from '../validation/brazilian-uf.js';
import { hmacSha256Hex } from '../crypto/hmac.js';
import { encryptField } from '../crypto/field-encryption.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DoctorsRouterConfig {
  repository: DoctorRepository;
  licenseHmacSecret: string;
  fieldEncryptionKey: string;
}

export function doctorsRouter(config: DoctorsRouterConfig): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { full_name, license_number, license_state, specialty, email, password } = req.body ?? {};

    if (
      typeof full_name !== 'string' || !full_name.trim() ||
      typeof license_number !== 'string' || !license_number.trim() ||
      typeof license_state !== 'string' ||
      typeof specialty !== 'string' || !specialty.trim() ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Campos obrigatórios ausentes ou inválidos.' });
      return;
    }

    if (!isValidBrazilianUf(license_state)) {
      res.status(400).json({ code: 'INVALID_LICENSE_STATE', message: 'UF do registro profissional inválida.' });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ code: 'INVALID_EMAIL', message: 'E-mail inválido.' });
      return;
    }

    if (!isStrongPassword(password)) {
      res.status(400).json({
        code: 'WEAK_PASSWORD',
        message: 'A senha deve ter ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const normalizedLicense = license_number.trim();
    const licenseHash = hmacSha256Hex(normalizedLicense, config.licenseHmacSecret);

    // DOC-01: reject without revealing whether it was the e-mail or the license number that collided.
    const alreadyExists = await config.repository.existsByEmailOrLicenseHash(normalizedEmail, licenseHash);
    if (alreadyExists) {
      res.status(409).json({ code: 'ACCOUNT_ALREADY_EXISTS', message: 'Não foi possível concluir o cadastro.' });
      return;
    }

    const record = await config.repository.create({
      fullName: full_name.trim(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      licenseNumberCiphertext: encryptField(normalizedLicense, config.fieldEncryptionKey),
      licenseHash,
      licenseState: license_state.toUpperCase(),
      specialty: specialty.trim(),
      phoneCiphertext: null,
      addressCiphertext: null,
    });

    res.status(201).json({ id: record.id, approval_status: record.approvalStatus });
  });

  // DOC-02: no session middleware yet, so the doctor is looked up by id in the
  // path — move behind an authenticated /doctor/approval-status using req.user.sub
  // once a JWT-verification middleware exists.
  router.get('/:doctorId/approval-status', async (req, res) => {
    const doctor = await config.repository.findById(req.params.doctorId);
    if (!doctor) {
      res.status(404).json({ code: 'DOCTOR_NOT_FOUND', message: 'Médico não encontrado.' });
      return;
    }
    res.json({ status: doctor.approvalStatus, reason: doctor.approvalReason });
  });

  return router;
}
