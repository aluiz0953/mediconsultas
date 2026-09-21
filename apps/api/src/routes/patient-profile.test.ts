import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientProfileRouter } from './patient-profile.js';
import { InMemoryPatientRepository, type PatientRepository } from '../repositories/patient-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';
import { encryptField } from '../crypto/field-encryption.js';

const JWT_SECRET = 'test-jwt-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

async function seedPatient(repository: PatientRepository) {
  return repository.create({
    fullName: 'Maria Souza',
    email: 'maria@example.com',
    passwordHash: 'irrelevant',
    cpfCiphertext: encryptField('11144477735', FIELD_ENCRYPTION_KEY),
    cpfHash: 'irrelevant-hash',
    birthDate: '1990-01-01',
    phoneCiphertext: encryptField('11999999999', FIELD_ENCRYPTION_KEY),
    addressCiphertext: encryptField('Rua Exemplo, 123', FIELD_ENCRYPTION_KEY),
    status: 'ACTIVE',
  });
}

function buildApp() {
  const repository = new InMemoryPatientRepository();
  const app: Express = express();
  app.use(express.json());
  app.use(
    '/api/v1/patient',
    requireAuth(JWT_SECRET),
    requireRole('PATIENT'),
    patientProfileRouter({ repository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
  );
  return { app, repository };
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/patient` };
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('a patient can view their own profile with a masked CPF', async () => {
  const { app, repository } = buildApp();
  const { server, base } = await startServer(app);
  try {
    const patient = await seedPatient(repository);
    const token = signSession({ sub: patient.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.full_name, 'Maria Souza');
    assert.equal(body.phone, '11999999999');
    assert.equal(body.cpf_masked, '***.***.***-35');
    assert.ok(!(String(body.cpf_masked ?? '').includes('11144477735')));
  } finally {
    server.close();
  }
});

test('a patient can update full_name, phone and address but not CPF or e-mail', async () => {
  const { app, repository } = buildApp();
  const { server, base } = await startServer(app);
  try {
    const patient = await seedPatient(repository);
    const token = signSession({ sub: patient.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await fetch(`${base}/me`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: 'Maria S. Silva', phone: '11888887777' }),
    });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.full_name, 'Maria S. Silva');
    assert.equal(body.phone, '11888887777');

    const stored = await repository.findById(patient.id);
    assert.equal(stored?.email, 'maria@example.com');
  } finally {
    server.close();
  }
});

test('rejects requests without a valid patient token', async () => {
  const { app } = buildApp();
  const { server, base } = await startServer(app);
  try {
    const noToken = await fetch(`${base}/me`);
    assert.equal(noToken.status, 401);

    const doctorToken = signSession({ sub: 'doc-1', role: 'DOCTOR' }, JWT_SECRET);
    const wrongRole = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${doctorToken}` } });
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});
