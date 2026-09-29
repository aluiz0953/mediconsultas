import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const JWT_SECRET = 'test-jwt-secret';
const ADMIN_TOKEN = signSession({ sub: 'admin-1', role: 'ADMIN' }, JWT_SECRET);
const authHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };

const validPayload = {
  full_name: 'Dr. João Silva',
  license_number: 'CRM-12345',
  license_state: 'SP',
  specialty: 'Cardiologia',
  email: 'joao.silva@example.com',
  password: 'Senha#Forte10',
};

function buildApp() {
  const app: Express = express();
  app.use(express.json());
  const repository = new InMemoryDoctorRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();
  app.use('/api/v1/doctors', doctorsRouter({ repository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use(
    '/api/v1/admin/doctors',
    requireAuth(JWT_SECRET),
    requireRole('ADMIN'),
    adminDoctorsRouter({ repository, auditEventRepository }),
  );
  return { app, auditEventRepository };
}

async function startServer(built: { app: Express }) {
  const server = built.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1` };
}

function post(url: string, body?: unknown, headers: Record<string, string> = authHeaders) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function registerDoctor(base: string) {
  const response = await post(`${base}/doctors/register`, validPayload);
  const body = await json(response);
  return body.id as string;
}

test('lists pending doctors', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    await registerDoctor(base);
    const response = await fetch(`${base}/admin/doctors/pending`, { headers: authHeaders });
    const body = await json(response);
    assert.equal((body.items as unknown[]).length, 1);
  } finally {
    server.close();
  }
});

test('approves a pending doctor and records an audit event (RN-09)', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built);
  try {
    const id = await registerDoctor(base);
    const response = await post(`${base}/admin/doctors/${id}/approve`, { approved_by: 'admin-1' });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'APPROVED');

    const statusResponse = await fetch(`${base}/doctors/${id}/approval-status`);
    const statusBody = await json(statusResponse);
    assert.equal(statusBody.status, 'APPROVED');

    const events = await built.auditEventRepository.list({ action: 'doctor.approved' });
    assert.equal(events.length, 1);
    assert.equal(events[0].resourceId, id);
    assert.equal(events[0].actorUserId, 'admin-1');
    assert.equal(events[0].result, 'SUCCESS');
  } finally {
    server.close();
  }
});

test('rejects a pending doctor, requires a reason, and records an audit event', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built);
  try {
    const id = await registerDoctor(base);

    const missingReason = await post(`${base}/admin/doctors/${id}/reject`, {});
    assert.equal(missingReason.status, 400);

    const response = await post(`${base}/admin/doctors/${id}/reject`, { reason: 'Documentos ilegíveis' });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'REJECTED');
    assert.equal(body.reason, 'Documentos ilegíveis');

    const events = await built.auditEventRepository.list({ action: 'doctor.rejected' });
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, 'Documentos ilegíveis');
  } finally {
    server.close();
  }
});

test('returns 404 when approving an unknown doctor', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const response = await post(`${base}/admin/doctors/00000000-0000-0000-0000-000000000000/approve`, {});
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('rejects admin requests without a valid token', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const noToken = await fetch(`${base}/admin/doctors/pending`);
    assert.equal(noToken.status, 401);

    const nonAdminToken = signSession({ sub: 'patient-1', role: 'PATIENT' }, JWT_SECRET);
    const wrongRole = await fetch(`${base}/admin/doctors/pending`, {
      headers: { authorization: `Bearer ${nonAdminToken}` },
    });
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});

test('approve/reject answer 404 (not 500) for a malformed doctor id', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const approve = await post(`${base}/admin/doctors/not-a-uuid/approve`, {});
    assert.equal(approve.status, 404);
    const reject = await post(`${base}/admin/doctors/not-a-uuid/reject`, { reason: 'x' });
    assert.equal(reject.status, 404);
  } finally {
    server.close();
  }
});
