import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { adminAuditRouter } from './admin-audit.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { doctorAppointmentsRouter } from './doctor-appointments.js';
import { clinicalRecordsRouter } from './clinical-records.js';
import { prescriptionsRouter } from './prescriptions.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryClinicalRecordRepository } from '../repositories/clinical-record-repository.js';
import { InMemoryPrescriptionRepository } from '../repositories/prescription-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const CPF_HMAC_SECRET = 'test-cpf-secret';
const LICENSE_HMAC_SECRET = 'test-license-secret';
const FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const JWT_SECRET = 'test-jwt-secret';
const ADMIN_TOKEN = signSession({ sub: 'admin-1', role: 'ADMIN' }, JWT_SECRET);
const adminHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };

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
  const prescriptionRepository = new InMemoryPrescriptionRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();

  app.use('/api/v1/patients', patientsRouter({ repository: patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/doctors', doctorsRouter({ repository: doctorRepository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use(
    '/api/v1/admin/doctors',
    requireAuth(JWT_SECRET),
    requireRole('ADMIN'),
    adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }),
  );
  app.use(
    '/api/v1/admin/audit-events',
    requireAuth(JWT_SECRET),
    requireRole('ADMIN'),
    adminAuditRouter({ repository: auditEventRepository }),
  );
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
  app.use(
    '/api/v1/doctor',
    requireAuth(JWT_SECRET),
    requireRole('DOCTOR'),
    prescriptionsRouter({
      appointmentRepository,
      prescriptionRepository,
      auditEventRepository,
      doctorRepository,
      fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
    }),
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

async function seedApprovedDoctorWithAppointment(base: string) {
  const patientResponse = await post(`${base}/patients/register`, patientPayload);
  const { id: patientId } = await json(patientResponse);

  const doctorResponse = await post(`${base}/doctors/register`, doctorPayload);
  const { id: doctorId } = await json(doctorResponse);
  await post(`${base}/admin/doctors/${doctorId}/approve`, {}, adminHeaders);

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

test('records an audit event when a doctor is approved', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId } = await seedApprovedDoctorWithAppointment(base);

    const response = await get(`${base}/admin/audit-events?action=doctor.approved`, adminHeaders);
    assert.equal(response.status, 200);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].resource_id, doctorId);
    assert.equal(items[0].result, 'SUCCESS');
  } finally {
    server.close();
  }
});

test('records audit events for clinical record create/update/finalize', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedApprovedDoctorWithAppointment(base);

    const createResponse = await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, {}, doctorAuthHeaders(doctorId));
    const { id: recordId } = await json(createResponse);
    await patch(`${base}/doctor/clinical-records/${recordId}`, { assessment: 'x', instructions: 'y' }, doctorAuthHeaders(doctorId));
    await post(`${base}/doctor/clinical-records/${recordId}/finalize`, { release_to_patient: true }, doctorAuthHeaders(doctorId));

    const response = await get(`${base}/admin/audit-events?resource_type=clinical_record`, adminHeaders);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    const actions = items.map((item) => item.action).sort();
    assert.deepEqual(actions, ['clinical_record.created', 'clinical_record.finalized', 'clinical_record.updated']);
  } finally {
    server.close();
  }
});

test('records an audit event for prescription finalize', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedApprovedDoctorWithAppointment(base);

    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana' }] },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);
    await post(`${base}/doctor/prescriptions/${prescriptionId}/finalize`, {}, doctorAuthHeaders(doctorId));

    const response = await get(`${base}/admin/audit-events?action=prescription.finalized`, adminHeaders);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].resource_id, prescriptionId);
  } finally {
    server.close();
  }
});

test('never exposes clinical content, only ids and metadata', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedApprovedDoctorWithAppointment(base);
    const createResponse = await post(`${base}/doctor/appointments/${appointmentId}/clinical-records`, {}, doctorAuthHeaders(doctorId));
    const { id: recordId } = await json(createResponse);
    await patch(
      `${base}/doctor/clinical-records/${recordId}`,
      { assessment: 'informação clínica sensível', instructions: 'y' },
      doctorAuthHeaders(doctorId),
    );

    const response = await get(`${base}/admin/audit-events?resource_type=clinical_record`, adminHeaders);
    const raw = await response.text();
    assert.equal(raw.includes('informação clínica sensível'), false);
  } finally {
    server.close();
  }
});

test('rejects audit log access without a valid admin token', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const noToken = await get(`${base}/admin/audit-events`);
    assert.equal(noToken.status, 401);

    const wrongRole = await get(`${base}/admin/audit-events`, doctorAuthHeaders('someone'));
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});
