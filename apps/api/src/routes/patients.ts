import { Router } from 'express';
import type { PatientRepository } from '../repositories/patient-repository.js';
import { hashPassword } from '../auth/password.js';
import { isValidCpf, normalizeCpf } from '../validation/cpf.js';
import { isStrongPassword } from '../validation/password-policy.js';
import { hmacSha256Hex } from '../crypto/hmac.js';
import { encryptField } from '../crypto/field-encryption.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PatientsRouterConfig {
  repository: PatientRepository;
  cpfHmacSecret: string;
  fieldEncryptionKey: string;
}

export function patientsRouter(config: PatientsRouterConfig): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { full_name, cpf, birth_date, email, phone, address, password } = req.body ?? {};

    if (
      typeof full_name !== 'string' || !full_name.trim() ||
      typeof cpf !== 'string' ||
      typeof birth_date !== 'string' ||
      typeof email !== 'string' ||
      typeof phone !== 'string' ||
      typeof address !== 'string' ||
      typeof password !== 'string'
    ) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Campos obrigatórios ausentes ou inválidos.' });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ code: 'INVALID_EMAIL', message: 'E-mail inválido.' });
      return;
    }

    if (!isValidCpf(cpf)) {
      res.status(400).json({ code: 'INVALID_CPF', message: 'CPF inválido.' });
      return;
    }

    const birthDate = new Date(birth_date);
    if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
      res.status(400).json({ code: 'INVALID_BIRTH_DATE', message: 'Data de nascimento inválida.' });
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
    const normalizedCpf = normalizeCpf(cpf);
    const cpfHash = hmacSha256Hex(normalizedCpf, config.cpfHmacSecret);

    // PAT-01: reject without revealing whether it was the e-mail or the CPF that collided.
    const alreadyExists = await config.repository.existsByEmailOrCpfHash(normalizedEmail, cpfHash);
    if (alreadyExists) {
      res.status(409).json({ code: 'ACCOUNT_ALREADY_EXISTS', message: 'Não foi possível concluir o cadastro.' });
      return;
    }

    const record = await config.repository.create({
      fullName: full_name.trim(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      cpfCiphertext: encryptField(normalizedCpf, config.fieldEncryptionKey),
      cpfHash,
      birthDate: birth_date,
      phoneCiphertext: encryptField(phone, config.fieldEncryptionKey),
      addressCiphertext: encryptField(address, config.fieldEncryptionKey),
      // ACTIVE immediately: there's no e-mail verification/activation flow yet,
      // so PENDING would mean the patient could never pass the login check.
      status: 'ACTIVE',
    });

    res.status(201).json({ id: record.id, status: record.status });
  });

  return router;
}
