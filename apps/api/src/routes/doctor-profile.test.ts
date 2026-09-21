import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { doctorProfileRouter } from './doctor-profile.js';
import { InMemoryDoctorRepository, type DoctorRepository } from '../repositories/doctor-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';
import { encryptField } from '../crypto/field-encryption.js';

const JWT_SECRET = 'test-jwt-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

async function seedDoctor(repository: DoctorRepository) {
  return repository.create({
    fullName: 'Dr. João Silva',
    email: 'joao.silva@example.com',
    passwordHash: 'irrelevant',
    licenseNumberCiphertext: encryptField('CRM-12345', FIELD_ENCRYPTION_KEY),
    licenseHash: 'irrelevant-hash',
    licenseState: 'SP',
    specialty: 'Cardiologia',
    phoneCiphertext: null,
    addressCiphertext: null,
  });
}

function buildApp() {
  const repository = new InMemoryDoctorRepository();
  const app: Express = express();
  app.use(express.json());
  app.use(
    '/api/v1/doctor',
    requireAuth(JWT_SECRET),
    requireRole('DOCTOR'),
    doctorProfileRouter({ repository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
  );
  return { app, repository };
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/doctor` };
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('a doctor can view their own profile, including approval status, with no phone/address yet', async () => {
  const { app, repository } = buildApp();
  const { server, base } = await startServer(app);
  try {
    const doctor = await seedDoctor(repository);
    const token = signSession({ sub: doctor.id, role: 'DOCTOR' }, JWT_SECRET);

    const response = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.full_name, 'Dr. João Silva');
    assert.equal(body.approval_status, 'PENDING_APPROVAL');
    assert.equal(body.phone, null);
    assert.equal(body.address, null);
  } finally {
    server.close();
  }
});

test('a doctor can set phone and address but not specialty or license', async () => {
  const { app, repository } = buildApp();
  const { server, base } = await startServer(app);
  try {
    const doctor = await seedDoctor(repository);
    const token = signSession({ sub: doctor.id, role: 'DOCTOR' }, JWT_SECRET);

    const response = await fetch(`${base}/me`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '11977776666', address: 'Av. Paulista, 1000' }),
    });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.phone, '11977776666');
    assert.equal(body.address, 'Av. Paulista, 1000');

    const stored = await repository.findById(doctor.id);
    assert.equal(stored?.specialty, 'Cardiologia');
    assert.equal(stored?.licenseState, 'SP');
  } finally {
    server.close();
  }
});

test('rejects requests without a valid doctor token', async () => {
  const { app } = buildApp();
  const { server, base } = await startServer(app);
  try {
    const patientToken = signSession({ sub: 'pat-1', role: 'PATIENT' }, JWT_SECRET);
    const wrongRole = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${patientToken}` } });
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});
