import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { patientAppointmentsRouter } from './patient-appointments.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const CPF_HMAC_SECRET = 'test-cpf-secret';
const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const JWT_SECRET = 'test-jwt-secret';

function patientAuthHeaders(patientId: unknown) {
  return { authorization: `Bearer ${signSession({ sub: String(patientId), role: 'PATIENT' }, JWT_SECRET)}` };
}

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

  app.use('/api/v1/patients', patientsRouter({ repository: patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/doctors', doctorsRouter({ repository: doctorRepository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/admin/doctors', adminDoctorsRouter({ repository: doctorRepository }));
  app.use('/api/v1/secretary/appointments', secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository }));
  app.use(
    '/api/v1/patient/appointments',
    requireAuth(JWT_SECRET),
    requireRole('PATIENT'),
    patientAppointmentsRouter({ appointmentRepository, doctorRepository }),
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

function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function seedAppointment(base: string) {
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

  return { patientId: patientId as string, doctorId: doctorId as string, appointmentId: appointmentId as string };
}

test('lists only the authenticated patient\'s own appointments (PAT-04)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, appointmentId } = await seedAppointment(base);

    const response = await get(`${base}/patient/appointments`, patientAuthHeaders(patientId));
    assert.equal(response.status, 200);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, appointmentId);

    const otherPatient = await get(`${base}/patient/appointments`, patientAuthHeaders('00000000-0000-0000-0000-000000000000'));
    const otherBody = await json(otherPatient);
    assert.equal((otherBody.items as unknown[]).length, 0);
  } finally {
    server.close();
  }
});

test('reads the detail of an own appointment (PAT-05)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId, appointmentId } = await seedAppointment(base);

    const response = await get(`${base}/patient/appointments/${appointmentId}`, patientAuthHeaders(patientId));
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.id, appointmentId);
    assert.equal((body.doctor as Record<string, unknown>).id, doctorId);
  } finally {
    server.close();
  }
});

test("returns 404 for another patient's appointment (no enumeration)", async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { appointmentId } = await seedAppointment(base);

    const response = await get(
      `${base}/patient/appointments/${appointmentId}`,
      patientAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('rejects requests without a valid patient token', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const noToken = await get(`${base}/patient/appointments`);
    assert.equal(noToken.status, 401);

    const wrongRole = await get(`${base}/patient/appointments`, doctorAuthHeaders('someone'));
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});
