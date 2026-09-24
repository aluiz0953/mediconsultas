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
import { patientClinicalRecordsRouter } from './patient-clinical-records.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryClinicalRecordRepository } from '../repositories/clinical-record-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { InMemoryDoctorScheduleBlockRepository } from '../repositories/doctor-schedule-block-repository.js';
import { InMemoryClinicSettingsRepository } from '../repositories/clinic-settings-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const CPF_HMAC_SECRET = 'test-cpf-secret';
const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const JWT_SECRET = 'test-jwt-secret';

function doctorAuthHeaders(doctorId: unknown) {
  return { authorization: `Bearer ${signSession({ sub: String(doctorId), role: 'DOCTOR' }, JWT_SECRET)}` };
}

function patientAuthHeaders(patientId: unknown) {
  return { authorization: `Bearer ${signSession({ sub: String(patientId), role: 'PATIENT' }, JWT_SECRET)}` };
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
  const blockRepository = new InMemoryDoctorScheduleBlockRepository();
  const clinicSettingsRepository = new InMemoryClinicSettingsRepository();

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
  app.use(
    '/api/v1/doctor',
    requireAuth(JWT_SECRET),
    requireRole('DOCTOR'),
    clinicalRecordsRouter({
      appointmentRepository,
      clinicalRecordRepository,
      auditEventRepository,
      doctorRepository,
      patientRepository,
      clinicSettingsRepository,
      fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
    }),
  );
  app.use(
    '/api/v1/patient/clinical-records',
    requireAuth(JWT_SECRET),
    requireRole('PATIENT'),
    patientClinicalRecordsRouter({ clinicalRecordRepository, doctorRepository, patientRepository, clinicSettingsRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
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

async function seedFinalizedRecord(base: string, release: boolean) {
  const patientResponse = await post(`${base}/patients/register`, patientPayload);
  const { id: patientId } = await json(patientResponse);

  const doctorResponse = await post(`${base}/doctors/register`, doctorPayload);
  const { id: doctorId } = await json(doctorResponse);
  await post(`${base}/admin/doctors/${doctorId}/approve`, {});

  const appointmentResponse = await post(`${base}/secretary/appointments`, {
    patient_id: patientId,
    doctor_id: doctorId,
    created_by: doctorId,
    starts_at: '2026-10-01T13:00:00Z',
    ends_at: '2026-10-01T13:30:00Z',
  });
  const { id: appointmentId } = await json(appointmentResponse);
  await post(`${base}/secretary/appointments/${appointmentId}/confirm`, {});
  await post(`${base}/doctor/appointments/${appointmentId}/start`, undefined, doctorAuthHeaders(doctorId));

  const createResponse = await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, {}, doctorAuthHeaders(doctorId));
  const { id: recordId } = await json(createResponse);
  await patch(
    `${base}/doctor/clinical-records/${recordId}`,
    { assessment: 'Hipertensão leve', instructions: 'Reduzir sal e retornar em 30 dias' },
    doctorAuthHeaders(doctorId),
  );
  await post(
    `${base}/doctor/clinical-records/${recordId}/finalize`,
    { release_to_patient: release },
    doctorAuthHeaders(doctorId),
  );

  return { patientId: patientId as string, doctorId: doctorId as string, recordId: recordId as string };
}

test('lists released records for the patient', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId } = await seedFinalizedRecord(base, true);
    const response = await get(`${base}/patient/clinical-records`, patientAuthHeaders(patientId));
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal((body.items as unknown[]).length, 1);
  } finally {
    server.close();
  }
});

test('reads a released record with decrypted content', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, recordId } = await seedFinalizedRecord(base, true);
    const response = await get(`${base}/patient/clinical-records/${recordId}`, patientAuthHeaders(patientId));
    assert.equal(response.status, 200);
    const body = await json(response);
    const content = body.content as Record<string, unknown>;
    assert.equal(content.assessment, 'Hipertensão leve');
    assert.equal(content.instructions, 'Reduzir sal e retornar em 30 dias');
  } finally {
    server.close();
  }
});

test('hides a finalized record that was not released', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, recordId } = await seedFinalizedRecord(base, false);
    const response = await get(`${base}/patient/clinical-records/${recordId}`, patientAuthHeaders(patientId));
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test("does not let a patient read another patient's record", async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { recordId } = await seedFinalizedRecord(base, true);
    const response = await get(
      `${base}/patient/clinical-records/${recordId}`,
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
    const { recordId } = await seedFinalizedRecord(base, true);

    const noToken = await get(`${base}/patient/clinical-records`);
    assert.equal(noToken.status, 401);

    const wrongRole = await get(`${base}/patient/clinical-records/${recordId}`, doctorAuthHeaders('someone'));
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});

test('generates a PDF for a released record, for the patient it belongs to', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, recordId } = await seedFinalizedRecord(base, true);

    const response = await get(`${base}/patient/clinical-records/${recordId}/pdf`, patientAuthHeaders(patientId));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');

    const wrongPatient = await get(
      `${base}/patient/clinical-records/${recordId}/pdf`,
      patientAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(wrongPatient.status, 404);
  } finally {
    server.close();
  }
});

test('refuses a PDF for a record that was not released to the patient', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { patientId, recordId } = await seedFinalizedRecord(base, false);
    const response = await get(`${base}/patient/clinical-records/${recordId}/pdf`, patientAuthHeaders(patientId));
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});
