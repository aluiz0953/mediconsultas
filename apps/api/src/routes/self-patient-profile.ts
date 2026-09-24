import { Router } from 'express';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { PatientRepository } from '../repositories/patient-repository.js';
import { isValidCpf, normalizeCpf } from '../validation/cpf.js';
import { hmacSha256Hex } from '../crypto/hmac.js';
import { encryptField } from '../crypto/field-encryption.js';

export interface SelfPatientProfileRouterConfig {
  accountRepository: AccountRepository;
  patientRepository: PatientRepository;
  cpfHmacSecret: string;
  fieldEncryptionKey: string;
}

// Staff (admin/secretary/doctor) can also be patients of the clinic without a
// second account: this adds patient data to their own existing account, which
// makes them searchable and bookable by the secretary like any patient.
export function selfPatientProfileRouter(config: SelfPatientProfileRouterConfig): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ exists: Boolean(await config.patientRepository.findById(req.user!.sub)) });
  });

  router.post('/', async (req, res) => {
    const { cpf, birth_date, phone, address } = req.body ?? {};
    if (typeof cpf !== 'string' || typeof birth_date !== 'string' || typeof phone !== 'string' || !phone.trim()) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'CPF, data de nascimento e telefone são obrigatórios.' });
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

    const userId = req.user!.sub;
    if (await config.patientRepository.findById(userId)) {
      res.status(409).json({ code: 'ALREADY_PATIENT', message: 'Seus dados de paciente já estão cadastrados.' });
      return;
    }
    const account = await config.accountRepository.findSummaryById(userId);
    if (!account) {
      res.status(404).json({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada.' });
      return;
    }

    const normalizedCpf = normalizeCpf(cpf);
    const cpfHash = hmacSha256Hex(normalizedCpf, config.cpfHmacSecret);
    if (await config.patientRepository.existsByEmailOrCpfHash('', cpfHash)) {
      res.status(409).json({ code: 'CPF_IN_USE', message: 'Este CPF já está em outro cadastro.' });
      return;
    }

    await config.patientRepository.addProfileToExistingUser(userId, {
      fullName: account.fullName ?? account.email,
      cpfCiphertext: encryptField(normalizedCpf, config.fieldEncryptionKey),
      cpfHash,
      birthDate: birth_date,
      phoneCiphertext: encryptField(phone.trim(), config.fieldEncryptionKey),
      addressCiphertext: encryptField(typeof address === 'string' ? address : '', config.fieldEncryptionKey),
    });
    res.status(201).json({ exists: true });
  });

  return router;
}
