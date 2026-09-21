import { Router } from 'express';
import type { PatientRepository } from '../repositories/patient-repository.js';
import { decryptField, encryptField } from '../crypto/field-encryption.js';

export interface PatientProfileRouterConfig {
  repository: PatientRepository;
  fieldEncryptionKey: string;
}

function maskCpf(cpf: string): string {
  return `***.***.***-${cpf.slice(-2)}`;
}

// patient_id comes from the authenticated JWT — mount behind requireAuth + requireRole('PATIENT').
export function patientProfileRouter(config: PatientProfileRouterConfig): Router {
  const router = Router();

  // PAT-02: view own profile. CPF is masked — no operational need to show it in full here.
  router.get('/me', async (req, res) => {
    const patient = await config.repository.findById(req.user!.sub);
    if (!patient) {
      res.status(404).json({ code: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado.' });
      return;
    }

    res.json({
      id: patient.id,
      full_name: patient.fullName,
      email: patient.email,
      cpf_masked: maskCpf(decryptField(patient.cpfCiphertext, config.fieldEncryptionKey)),
      birth_date: patient.birthDate,
      phone: patient.phoneCiphertext ? decryptField(patient.phoneCiphertext, config.fieldEncryptionKey) : null,
      address: patient.addressCiphertext ? decryptField(patient.addressCiphertext, config.fieldEncryptionKey) : null,
    });
  });

  // PAT-02: full_name, phone and address are self-editable. CPF, e-mail,
  // password, status and permissions are not — those go through other routes
  // with their own rules (RF-03).
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
