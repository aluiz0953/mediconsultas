import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { doctorsRouter } from './doctors.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';

const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const validPayload = {
  full_name: 'Dr. João Silva',
  license_number: 'CRM-12345',
  license_state: 'SP',
  specialty: 'Cardiologia',
  email: 'joao.silva@example.com',
  password: 'Senha#Forte10',
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/doctors',
    doctorsRouter({
      repository: new InMemoryDoctorRepository(),
      licenseHmacSecret: LICENSE_HMAC_SECRET,
      fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
    }),
  );
  return app;
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}/api/v1/doctors` };
}

function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('registers a doctor with PENDING_APPROVAL status', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const response = await post(`${url}/register`, validPayload);
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.approval_status, 'PENDING_APPROVAL');
    assert.ok(body.id);
  } finally {
    server.close();
  }
});

test('rejects an invalid UF', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const response = await post(`${url}/register`, { ...validPayload, license_state: 'ZZ' });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('rejects duplicate registration without revealing which field collided', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const first = await post(`${url}/register`, validPayload);
    assert.equal(first.status, 201);

    const second = await post(`${url}/register`, { ...validPayload, specialty: 'Dermatologia' });
    assert.equal(second.status, 409);
  } finally {
    server.close();
  }
});

test('exposes approval status by id', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const registerResponse = await post(`${url}/register`, validPayload);
    const { id } = await json(registerResponse);

    const statusResponse = await fetch(`${url}/${id}/approval-status`);
    assert.equal(statusResponse.status, 200);
    const body = await json(statusResponse);
    assert.equal(body.status, 'PENDING_APPROVAL');
  } finally {
    server.close();
  }
});

test('returns 404 for an unknown doctor id', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const response = await fetch(`${url}/00000000-0000-0000-0000-000000000000/approval-status`);
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});
