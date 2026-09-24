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
import { InMemoryDoctorScheduleBlockRepository } from '../repositories/doctor-schedule-block-repository.js';
import { InMemoryClinicSettingsRepository } from '../repositories/clinic-settings-repository.js';
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
  const blockRepository = new InMemoryDoctorScheduleBlockRepository();
  const clinicSettingsRepository = new InMemoryClinicSettingsRepository();

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

test('exports the audit log as CSV and requires a reason (ADM-08)', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const { doctorId } = await seedApprovedDoctorWithAppointment(base);

    const missingReason = await get(`${base}/admin/audit-events/export`, adminHeaders);
    assert.equal(missingReason.status, 400);
    const missingReasonBody = await json(missingReason);
    assert.equal(missingReasonBody.code, 'REASON_REQUIRED');

    const response = await get(
      `${base}/admin/audit-events/export?action=doctor.approved&reason=${encodeURIComponent('Relatório de conformidade mensal')}`,
      adminHeaders,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="audit-log-\d+\.csv"/);

    const csv = await response.text();
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'id,actor_user_id,actor_role,action,resource_type,resource_id,patient_id,result,reason,platform,created_at');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes(doctorId));
    assert.ok(!csv.includes('informação clínica'));

    // Exporting itself must be audited with the given reason.
    const auditTrail = await get(`${base}/admin/audit-events?action=audit_log.exported`, adminHeaders);
    const auditTrailBody = await json(auditTrail);
    const items = auditTrailBody.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].reason, 'Relatório de conformidade mensal');
    assert.equal(items[0].actor_role, 'ADMIN');
  } finally {
    server.close();
  }
});

test('escapes CSV fields containing commas or quotes', async () => {
  const { server, base } = await startServer(buildApp());
  try {
    const doctorResponse = await post(`${base}/doctors/register`, {
      ...doctorPayload,
      email: 'outro.medico@example.com',
      license_number: 'CRM-99999',
    });
    const { id: doctorId } = await json(doctorResponse);
    await post(`${base}/admin/doctors/${doctorId}/reject`, { reason: 'Faltam docs, "urgente"' }, adminHeaders);

    const response = await get(`${base}/admin/audit-events/export?action=doctor.rejected&reason=teste`, adminHeaders);
    const csv = await response.text();
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes(`admin-1,ADMIN,doctor.rejected,doctor_profile,${doctorId},,SUCCESS,"Faltam docs, ""urgente""",`));
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
