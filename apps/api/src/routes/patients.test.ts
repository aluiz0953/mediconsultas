import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';

const CPF_HMAC_SECRET = 'test-cpf-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const validPayload = {
  full_name: 'Maria Souza',
  cpf: '111.444.777-35',
  birth_date: '1990-01-01',
  email: 'maria@example.com',
  phone: '11999999999',
  address: 'Rua Exemplo, 123',
  password: 'Senha#Forte10',
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/patients',
    patientsRouter({
      repository: new InMemoryPatientRepository(),
      cpfHmacSecret: CPF_HMAC_SECRET,
      fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
    }),
  );
  return app;
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}/api/v1/patients/register` };
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

test('registers a patient with valid data', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const response = await post(url, validPayload);
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.status, 'ACTIVE');
    assert.ok(body.id);
  } finally {
    server.close();
  }
});

test('rejects an invalid CPF', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const response = await post(url, { ...validPayload, cpf: '111.111.111-11' });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('rejects a weak password', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const response = await post(url, { ...validPayload, password: 'weak' });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('rejects duplicate registration without revealing which field collided', async () => {
  const { server, url } = await startServer(buildApp());
  try {
    const first = await post(url, validPayload);
    assert.equal(first.status, 201);

    const second = await post(url, { ...validPayload, phone: '11888888888' });
    assert.equal(second.status, 409);
    const body = await json(second);
    assert.equal(body.code, 'ACCOUNT_ALREADY_EXISTS');
    assert.ok(!('email' in body) && !('cpf' in body));
  } finally {
    server.close();
  }
});
