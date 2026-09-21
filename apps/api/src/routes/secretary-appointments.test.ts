import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const CPF_HMAC_SECRET = 'test-cpf-secret';
const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const JWT_SECRET = 'test-jwt-secret';
const SECRETARY_TOKEN = signSession({ sub: 'secretary-1', role: 'SECRETARY' }, JWT_SECRET);
const authHeaders = { authorization: `Bearer ${SECRETARY_TOKEN}` };

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
  const auditEventRepository = new InMemoryAuditEventRepository();

  app.use('/api/v1/patients', patientsRouter({ repository: patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/doctors', doctorsRouter({ repository: doctorRepository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/admin/doctors', adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }));
  app.use(
    '/api/v1/secretary/appointments',
    requireAuth(JWT_SECRET),
    requireRole('SECRETARY', 'ADMIN'),
    secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository }),
  );
  return app;
}

async function startServer(app: Express) {
  const server = app.listen(0);
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

function get(url: string, headers: Record<string, string> = authHeaders) {
  return fetch(url, { headers });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function seedPatientAndApprovedDoctor(base: string) {
  const patientResponse = await post(`${base}/patients/register`, patientPayload);
  const { id: patientId } = await json(patientResponse);

  const doctorResponse = await post(`${base}/doctors/register`, doctorPayload);
  const { id: doctorId } = await json(doctorResponse);
  await post(`${base}/admin/doctors/${doctorId}/approve`, {});

  return { patientId: patientId as string, doctorId: doctorId as string };
}

async function scheduleAppointment(base: string, patientId: string, doctorId: string) {
  const response = await post(`${base}/secretary/appointments`, {
    patient_id: patientId,
    doctor_id: doctorId,
    starts_at: '2026-10-01T13:00:00Z',
    ends_at: '2026-10-01T13:30:00Z',
  });
  const body = await json(response);
  return body.id as string;
}

test('schedules an appointment for a patient and an approved doctor', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const response = await post(`${base}/secretary/appointments`, {
      patient_id: patientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:00:00Z',
      ends_at: '2026-10-01T13:30:00Z',
    });
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.status, 'SCHEDULED');
    assert.equal((body.patient as Record<string, unknown>).id, patientId);
    assert.equal((body.doctor as Record<string, unknown>).id, doctorId);
  } finally {
    server.close();
  }
});

test('rejects scheduling with a doctor that is not approved', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const patientResponse = await post(`${base}/patients/register`, patientPayload);
    const { id: patientId } = await json(patientResponse);
    const doctorResponse = await post(`${base}/doctors/register`, doctorPayload);
    const { id: doctorId } = await json(doctorResponse);

    const response = await post(`${base}/secretary/appointments`, {
      patient_id: patientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:00:00Z',
      ends_at: '2026-10-01T13:30:00Z',
    });
    assert.equal(response.status, 409);
    const body = await json(response);
    assert.equal(body.code, 'DOCTOR_NOT_AVAILABLE');
  } finally {
    server.close();
  }
});

test('rejects overlapping appointments for the same doctor (RN-04)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const first = await post(`${base}/secretary/appointments`, {
      patient_id: patientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:00:00Z',
      ends_at: '2026-10-01T13:30:00Z',
    });
    assert.equal(first.status, 201);

    const overlapping = await post(`${base}/secretary/appointments`, {
      patient_id: patientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:15:00Z',
      ends_at: '2026-10-01T13:45:00Z',
    });
    assert.equal(overlapping.status, 409);
    const body = await json(overlapping);
    assert.equal(body.code, 'APPOINTMENT_SLOT_UNAVAILABLE');
  } finally {
    server.close();
  }
});

test('rejects an unknown patient', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId } = await seedPatientAndApprovedDoctor(base);
    const response = await post(`${base}/secretary/appointments`, {
      patient_id: '00000000-0000-0000-0000-000000000000',
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:00:00Z',
      ends_at: '2026-10-01T13:30:00Z',
    });
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('rejects an invalid time range', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const response = await post(`${base}/secretary/appointments`, {
      patient_id: patientId,
      doctor_id: doctorId,
      starts_at: '2026-10-01T13:30:00Z',
      ends_at: '2026-10-01T13:00:00Z',
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('confirms a scheduled appointment (SEC-05)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const appointmentId = await scheduleAppointment(base, patientId, doctorId);

    const response = await post(`${base}/secretary/appointments/${appointmentId}/confirm`, {});
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'CONFIRMED');
  } finally {
    server.close();
  }
});

test('rejects confirming an appointment that is not SCHEDULED', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const appointmentId = await scheduleAppointment(base, patientId, doctorId);
    await post(`${base}/secretary/appointments/${appointmentId}/confirm`, {});

    const secondConfirm = await post(`${base}/secretary/appointments/${appointmentId}/confirm`, {});
    assert.equal(secondConfirm.status, 409);
    const body = await json(secondConfirm);
    assert.equal(body.code, 'INVALID_STATUS_TRANSITION');
  } finally {
    server.close();
  }
});

test('cancels a scheduled appointment', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const appointmentId = await scheduleAppointment(base, patientId, doctorId);

    const response = await post(`${base}/secretary/appointments/${appointmentId}/cancel`, {});
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'CANCELLED');
  } finally {
    server.close();
  }
});

test('rejects cancelling an appointment that is already cancelled', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    const appointmentId = await scheduleAppointment(base, patientId, doctorId);
    await post(`${base}/secretary/appointments/${appointmentId}/cancel`, {});

    const secondCancel = await post(`${base}/secretary/appointments/${appointmentId}/cancel`, {});
    assert.equal(secondCancel.status, 409);
  } finally {
    server.close();
  }
});

test('lists approved doctors for the scheduling picker', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId } = await seedPatientAndApprovedDoctor(base);
    const response = await get(`${base}/secretary/appointments/doctors`);
    assert.equal(response.status, 200);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, doctorId);
  } finally {
    server.close();
  }
});

test('searches patients by name for the scheduling picker', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    await seedPatientAndApprovedDoctor(base);
    const response = await get(`${base}/secretary/appointments/patients?search=Maria`);
    assert.equal(response.status, 200);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].full_name, 'Maria Souza');
  } finally {
    server.close();
  }
});

test('lists appointments for the requested day', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, doctorId } = await seedPatientAndApprovedDoctor(base);
    await scheduleAppointment(base, patientId, doctorId);

    const sameDay = await get(`${base}/secretary/appointments?date=2026-10-01`);
    const sameDayBody = await json(sameDay);
    assert.equal((sameDayBody.items as unknown[]).length, 1);

    const otherDay = await get(`${base}/secretary/appointments?date=2026-10-02`);
    const otherDayBody = await json(otherDay);
    assert.equal((otherDayBody.items as unknown[]).length, 0);
  } finally {
    server.close();
  }
});

test('rejects secretary requests without a valid token', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const noToken = await fetch(`${base}/secretary/appointments`);
    assert.equal(noToken.status, 401);

    const patientToken = signSession({ sub: 'patient-1', role: 'PATIENT' }, JWT_SECRET);
    const wrongRole = await fetch(`${base}/secretary/appointments`, {
      headers: { authorization: `Bearer ${patientToken}` },
    });
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});
