import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { doctorAppointmentsRouter } from './doctor-appointments.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { InMemoryDoctorScheduleBlockRepository } from '../repositories/doctor-schedule-block-repository.js';
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

const secondPatientPayload = {
  full_name: 'Carlos Pereira',
  cpf: '100.000.000-19',
  birth_date: '1985-05-05',
  email: 'carlos@example.com',
  phone: '11988888888',
  address: 'Rua Exemplo, 456',
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
  const auditEventRepository = new InMemoryAuditEventRepository();
  const blockRepository = new InMemoryDoctorScheduleBlockRepository();

  app.use('/api/v1/patients', patientsRouter({ repository: patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/doctors', doctorsRouter({ repository: doctorRepository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/admin/doctors', adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }));
  app.use('/api/v1/secretary/appointments', secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository, blockRepository, cpfHmacSecret: CPF_HMAC_SECRET }));
  app.use(
    '/api/v1/doctor/appointments',
    requireAuth(JWT_SECRET),
    requireRole('DOCTOR'),
    doctorAppointmentsRouter({ appointmentRepository, patientRepository, cpfHmacSecret: CPF_HMAC_SECRET }),
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
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function seedConfirmedAppointment(base: string) {
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

  return { patientId: patientId as string, doctorId: doctorId as string, appointmentId: appointmentId as string };
}

test('starts a confirmed appointment for the linked doctor (DOC-04)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedConfirmedAppointment(base);
    const response = await post(`${base}/doctor/appointments/${appointmentId}/start`, undefined, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'IN_PROGRESS');
  } finally {
    server.close();
  }
});

test('rejects starting an appointment that belongs to a different doctor', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { appointmentId } = await seedConfirmedAppointment(base);
    const response = await post(
      `${base}/doctor/appointments/${appointmentId}/start`,
      undefined,
      doctorAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(response.status, 403);
    const body = await json(response);
    assert.equal(body.code, 'RESOURCE_ACCESS_DENIED');
  } finally {
    server.close();
  }
});

test('rejects starting an appointment that is not CONFIRMED', async () => {
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

    // still SCHEDULED, never confirmed
    const response = await post(`${base}/doctor/appointments/${appointmentId}/start`, undefined, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 409);
    const body = await json(response);
    assert.equal(body.code, 'INVALID_STATUS_TRANSITION');
  } finally {
    server.close();
  }
});

test('returns 404 for an unknown appointment', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const response = await post(
      `${base}/doctor/appointments/00000000-0000-0000-0000-000000000000/start`,
      undefined,
      doctorAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test("lists the doctor's queue for the appointment day (DOC-03)", async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedConfirmedAppointment(base);

    const sameDay = await get(`${base}/doctor/appointments?date=2026-10-01`, doctorAuthHeaders(doctorId));
    const sameDayBody = await json(sameDay);
    const items = sameDayBody.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, appointmentId);

    const otherDay = await get(`${base}/doctor/appointments?date=2026-10-02`, doctorAuthHeaders(doctorId));
    const otherDayBody = await json(otherDay);
    assert.equal((otherDayBody.items as unknown[]).length, 0);
  } finally {
    server.close();
  }
});

test("filters the doctor's queue by status and by patient name/CPF", async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId, appointmentId } = await seedConfirmedAppointment(base);
    const secondPatientResponse = await post(`${base}/patients/register`, secondPatientPayload);
    const { id: secondPatientId } = await json(secondPatientResponse);
    await post(`${base}/secretary/appointments`, {
      patient_id: secondPatientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T14:00:00Z',
      ends_at: '2026-10-01T14:30:00Z',
    });

    const byStatus = await get(`${base}/doctor/appointments?date=2026-10-01&status=CONFIRMED`, doctorAuthHeaders(doctorId));
    const byStatusBody = await json(byStatus);
    assert.equal((byStatusBody.items as unknown[]).length, 1);
    assert.equal((byStatusBody.items as Array<Record<string, unknown>>)[0].id, appointmentId);

    const byName = await get(`${base}/doctor/appointments?date=2026-10-01&search=Carlos`, doctorAuthHeaders(doctorId));
    const byNameBody = await json(byName);
    const byNameItems = byNameBody.items as Array<Record<string, unknown>>;
    assert.equal(byNameItems.length, 1);
    assert.equal((byNameItems[0].patient as Record<string, unknown>).id, secondPatientId);

    const byCpf = await get(
      `${base}/doctor/appointments?date=2026-10-01&search=${encodeURIComponent('111.444.777-35')}`,
      doctorAuthHeaders(doctorId),
    );
    const byCpfBody = await json(byCpf);
    const byCpfItems = byCpfBody.items as Array<Record<string, unknown>>;
    assert.equal(byCpfItems.length, 1);
    assert.equal((byCpfItems[0].patient as Record<string, unknown>).id, patientId);
  } finally {
    server.close();
  }
});

test('rejects doctor requests without a valid token', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const noToken = await fetch(`${base}/doctor/appointments`);
    assert.equal(noToken.status, 401);

    const patientToken = signSession({ sub: 'patient-1', role: 'PATIENT' }, JWT_SECRET);
    const wrongRole = await fetch(`${base}/doctor/appointments`, {
      headers: { authorization: `Bearer ${patientToken}` },
    });
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});
