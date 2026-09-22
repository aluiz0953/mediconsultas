import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { doctorAppointmentsRouter } from './doctor-appointments.js';
import { prescriptionsRouter } from './prescriptions.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryPrescriptionRepository } from '../repositories/prescription-repository.js';
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
  const prescriptionRepository = new InMemoryPrescriptionRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();
  const blockRepository = new InMemoryDoctorScheduleBlockRepository();
  const clinicSettingsRepository = new InMemoryClinicSettingsRepository();

  app.use('/api/v1/patients', patientsRouter({ repository: patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/doctors', doctorsRouter({ repository: doctorRepository, licenseHmacSecret: LICENSE_HMAC_SECRET, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));
  app.use('/api/v1/admin/doctors', adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }));
  app.use('/api/v1/secretary/appointments', secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository, blockRepository }));
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
    prescriptionsRouter({
      appointmentRepository,
      prescriptionRepository,
      auditEventRepository,
      doctorRepository,
      clinicSettingsRepository,
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

test('creates a draft prescription with items', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const response = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana', dosage: '50mg', frequency: '1x ao dia' }] },
      doctorAuthHeaders(doctorId),
    );
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.status, 'DRAFT');
  } finally {
    server.close();
  }
});

test('fetches the draft back with its items (GET)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana', dosage: '50mg' }] },
      doctorAuthHeaders(doctorId),
    );

    const response = await get(`${base}/doctor/appointments/${appointmentId}/prescription`, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
    const body = await json(response);
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items[0].medication_name, 'Losartana');
  } finally {
    server.close();
  }
});

test('rejects an item without medication_name', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const response = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ dosage: '50mg' }] },
      doctorAuthHeaders(doctorId),
    );
    assert.equal(response.status, 400);
    const body = await json(response);
    assert.equal(body.code, 'INVALID_ITEMS');
  } finally {
    server.close();
  }
});

test('rejects finalizing with no items and no_medication_needed unset', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(`${base}/doctor/appointments/${appointmentId}/prescriptions`, {}, doctorAuthHeaders(doctorId));
    const { id: prescriptionId } = await json(createResponse);

    const response = await post(`${base}/doctor/prescriptions/${prescriptionId}/finalize`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 400);
    const body = await json(response);
    assert.equal(body.code, 'PRESCRIPTION_REQUIRES_ITEMS');
  } finally {
    server.close();
  }
});

test('finalizes a prescription with items', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana' }] },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);

    const response = await post(`${base}/doctor/prescriptions/${prescriptionId}/finalize`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'FINALIZED');
    assert.ok(body.issued_at);
  } finally {
    server.close();
  }
});

test('downloads the PDF of a finalized prescription (RF-09)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana', dosage: '50mg' }] },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);
    await post(`${base}/doctor/prescriptions/${prescriptionId}/finalize`, {}, doctorAuthHeaders(doctorId));

    const response = await get(`${base}/doctor/prescriptions/${prescriptionId}/pdf`, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const buffer = await response.arrayBuffer();
    assert.ok(buffer.byteLength > 0);
  } finally {
    server.close();
  }
});

test('rejects downloading the PDF of a prescription still in draft', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana' }] },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);

    const response = await get(`${base}/doctor/prescriptions/${prescriptionId}/pdf`, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('rejects downloading the PDF from a doctor not linked to the prescription', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana' }] },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);
    await post(`${base}/doctor/prescriptions/${prescriptionId}/finalize`, {}, doctorAuthHeaders(doctorId));

    const response = await get(
      `${base}/doctor/prescriptions/${prescriptionId}/pdf`,
      doctorAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('finalizes a prescription explicitly marked as not needed', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { no_medication_needed: true },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);

    const response = await post(`${base}/doctor/prescriptions/${prescriptionId}/finalize`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
  } finally {
    server.close();
  }
});

test('rejects access from a doctor not linked to the prescription', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);
    const createResponse = await post(
      `${base}/doctor/appointments/${appointmentId}/prescriptions`,
      { items: [{ medication_name: 'Losartana' }] },
      doctorAuthHeaders(doctorId),
    );
    const { id: prescriptionId } = await json(createResponse);

    const response = await post(
      `${base}/doctor/prescriptions/${prescriptionId}/finalize`,
      {},
      doctorAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});
