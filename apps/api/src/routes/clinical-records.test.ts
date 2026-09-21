import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { doctorAppointmentsRouter } from './doctor-appointments.js';
import { clinicalRecordsRouter } from './clinical-records.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryClinicalRecordRepository } from '../repositories/clinical-record-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const CPF_HMAC_SECRET = 'test-cpf-secret';
const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const JWT_SECRET = 'test-jwt-secret';

function doctorAuthHeaders(doctorId: unknown) {
  return { authorization: `Bearer ${signSession({ sub: String(doctorId), role: 'DOCTOR' }, JWT_SECRET)}` };
}

const patientPayload = {
  full_name: 'Maria Souza',
  cpf: '111.444.777-35',
  birth_date: '1990-01-01',
  email: 'maria@example.com',
  phone: '11999999999',
  address: 'Rua Exemplo, 123',
  password: 'Senha#Forte10',
};

const doctorPayload = {
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
  const patientRepository = new InMemoryPatientRepository();
  const doctorRepository = new InMemoryDoctorRepository();
  const appointmentRepository = new InMemoryAppointmentRepository();
  const clinicalRecordRepository = new InMemoryClinicalRecordRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();

  app.use('/api/v1/patients', patientsRouter({ repository: patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/doctors', doctorsRouter({ repository: doctorRepository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/admin/doctors', adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }));
  app.use('/api/v1/secretary/appointments', secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository }));
  app.use(
    '/api/v1/doctor/appointments',
    requireAuth(JWT_SECRET),
    requireRole('DOCTOR'),
    doctorAppointmentsRouter({ appointmentRepository, patientRepository }),
  );
  app.use(
    '/api/v1/doctor',
    requireAuth(JWT_SECRET),
    requireRole('DOCTOR'),
    clinicalRecordsRouter({ appointmentRepository, clinicalRecordRepository, auditEventRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
  );
  return app;
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1` };
}

function post(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function patch(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function seedInProgressAppointment(base: string) {
  const patientResponse = await post(`${base}/patients/register`, patientPayload);
  const { id: patientId } = await json(patientResponse);

  const doctorResponse = await post(`${base}/doctors/register`, doctorPayload);
  const { id: doctorId } = await json(doctorResponse);
  await post(`${base}/admin/doctors/${doctorId}/approve`, {});

  const appointmentResponse = await post(`${base}/secretary/appointments`, {
    patient_id: patientId,
    doctor_id: doctorId,
    starts_at: '2026-10-01T13:00:00Z',
    ends_at: '2026-10-01T13:30:00Z',
  });
  const { id: appointmentId } = await json(appointmentResponse);
  await post(`${base}/secretary/appointments/${appointmentId}/confirm`, {});
  await post(`${base}/doctor/appointments/${appointmentId}/start`, undefined, doctorAuthHeaders(doctorId));

  return { patientId: patientId as string, doctorId: doctorId as string, appointmentId: appointmentId as string };
}

test('opens a draft clinical record for an in-progress appointment', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const response = await post(
      `${base}/doctor/appointments/${appointmentId}/clinical-records`,
      { chief_complaint: 'Dor no peito' },
      doctorAuthHeaders(doctorId),
    );
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.status, 'DRAFT');
    assert.equal(body.version, 1);
  } finally {
    server.close();
  }
});

test('fetches the draft back with its content (GET)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, { chief_complaint: 'Dor no peito' }, doctorAuthHeaders(doctorId));

    const response = await get(`${base}/doctor/appointments/${appointmentId}/clinical-record`, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal((body.content as Record<string, unknown>).chief_complaint, 'Dor no peito');
  } finally {
    server.close();
  }
});

test('returns 404 fetching a clinical record before one was opened', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const response = await get(`${base}/doctor/appointments/${appointmentId}/clinical-record`, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('rejects opening a record when the appointment is not IN_PROGRESS', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const patientResponse = await post(`${base}/patients/register`, patientPayload);
    const { id: patientId } = await json(patientResponse);
    const doctorResponse = await post(`${base}/doctors/register`, doctorPayload);
    const { id: doctorId } = await json(doctorResponse);
    await post(`${base}/admin/doctors/${doctorId}/approve`, {});
    const appointmentResponse = await post(`${base}/secretary/appointments`, {
      patient_id: patientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:00:00Z',
      ends_at: '2026-10-01T13:30:00Z',
    });
    const { id: appointmentId } = await json(appointmentResponse);

    const response = await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 409);
  } finally {
    server.close();
  }
});

test('rejects opening a record from a doctor not linked to the appointment', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { appointmentId } = await seedInProgressAppointment(base);
    const response = await post(
      `${base}/doctor/appointments/${appointmentId}/clinical-records`,
      {},
      doctorAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('rejects finalizing with an incomplete draft', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, {}, doctorAuthHeaders(doctorId));
    const { id: recordId } = await json(createResponse);

    const response = await post(`${base}/doctor/clinical-records/${recordId}/finalize`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 400);
    const body = await json(response);
    assert.equal(body.code, 'INCOMPLETE_CLINICAL_RECORD');
  } finally {
    server.close();
  }
});

test('edits a draft then finalizes and releases it to the patient', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/clinical-records`,
      { chief_complaint: 'Dor no peito' },
      doctorAuthHeaders(doctorId),
    );
    const { id: recordId } = await json(createResponse);

    const patchResponse = await patch(
      `${base}/doctor/clinical-records/${recordId}`,
      { assessment: 'Hipertensão leve', instructions: 'Reduzir sal e retornar em 30 dias' },
      doctorAuthHeaders(doctorId),
    );
    assert.equal(patchResponse.status, 200);

    const finalizeResponse = await post(
      `${base}/doctor/clinical-records/${recordId}/finalize`,
      { release_to_patient: true },
      doctorAuthHeaders(doctorId),
    );
    assert.equal(finalizeResponse.status, 200);
    const body = await json(finalizeResponse);
    assert.equal(body.status, 'FINALIZED');
    assert.ok(body.released_at);
  } finally {
    server.close();
  }
});

test('rejects finalizing a record twice', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, {}, doctorAuthHeaders(doctorId));
    const { id: recordId } = await json(createResponse);
    await patch(
      `${base}/doctor/clinical-records/${recordId}`,
      { assessment: 'Hipertensão leve', instructions: 'Reduzir sal' },
      doctorAuthHeaders(doctorId),
    );
    await post(`${base}/doctor/clinical-records/${recordId}/finalize`, {}, doctorAuthHeaders(doctorId));

    const response = await post(`${base}/doctor/clinical-records/${recordId}/finalize`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 409);
    const body = await json(response);
    assert.equal(body.code, 'INVALID_STATUS_TRANSITION');
  } finally {
    server.close();
  }
});
