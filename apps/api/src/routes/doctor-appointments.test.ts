import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { patientsRouter } from './patients.js';
import { doctorsRouter } from './doctors.js';
import { adminDoctorsRouter } from './admin-doctors.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { doctorAppointmentsRouter, type DoctorAppointmentsRouterConfig } from './doctor-appointments.js';
import { InMemoryClinicalRecordRepository } from '../repositories/clinical-record-repository.js';
import { InMemoryPrescriptionRepository } from '../repositories/prescription-repository.js';
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

function buildApp(completion?: DoctorAppointmentsRouterConfig['completion']): Express {
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
    doctorAppointmentsRouter({ appointmentRepository, patientRepository, cpfHmacSecret: CPF_HMAC_SECRET, completion }),
  );
  return app;
}

function buildCompletion() {
  return {
    clinicalRecordRepository: new InMemoryClinicalRecordRepository(),
    prescriptionRepository: new InMemoryPrescriptionRepository(),
    auditEventRepository: new InMemoryAuditEventRepository(),
  };
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

async function seedInProgressAppointment(base: string) {
  const ids = await seedConfirmedAppointment(base);
  await post(`${base}/doctor/appointments/${ids.appointmentId}/start`, undefined, doctorAuthHeaders(ids.doctorId));
  return ids;
}

test('completes an in-progress appointment with a finalized clinical record and audits it (DOC-07)', async () => {
  const completion = buildCompletion();
  const { server, base } = await startServer(buildApp(completion));
  try {
    const { patientId, doctorId, appointmentId } = await seedInProgressAppointment(base);
    const record = await completion.clinicalRecordRepository.create({ appointmentId, patientId, doctorId, contentCiphertext: 'x' });
    await completion.clinicalRecordRepository.finalize(record.id, { finalizedAt: new Date(), releasedAt: null });

    const response = await post(`${base}/doctor/appointments/${appointmentId}/complete`, {}, doctorAuthHeaders(doctorId));
    assert.equal(response.status, 200);
    assert.equal((await json(response)).status, 'COMPLETED');

    const [event] = await completion.auditEventRepository.list({ action: 'appointment.completed' });
    assert.equal(event.resourceId, appointmentId);
    assert.equal(event.actorUserId, doctorId);
    assert.equal(event.reason, 'clinical_record v1');

    const again = await post(`${base}/doctor/appointments/${appointmentId}/complete`, {}, doctorAuthHeaders(doctorId));
    assert.equal(again.status, 409);
  } finally {
    server.close();
  }
});

test('completing without a clinical record requires a justification (DOC-07)', async () => {
  const completion = buildCompletion();
  const { server, base } = await startServer(buildApp(completion));
  try {
    const { doctorId, appointmentId } = await seedInProgressAppointment(base);

    const missing = await post(`${base}/doctor/appointments/${appointmentId}/complete`, { no_record_reason: '  ' }, doctorAuthHeaders(doctorId));
    assert.equal(missing.status, 400);
    assert.equal((await json(missing)).code, 'CLINICAL_RECORD_REQUIRED');

    const justified = await post(
      `${base}/doctor/appointments/${appointmentId}/complete`,
      { no_record_reason: 'Paciente só veio buscar um atestado.' },
      doctorAuthHeaders(doctorId),
    );
    assert.equal(justified.status, 200);
    const [event] = await completion.auditEventRepository.list({ action: 'appointment.completed' });
    assert.equal(event.reason, 'sem registro clínico: Paciente só veio buscar um atestado.');
  } finally {
    server.close();
  }
});

test('completing is blocked by a draft clinical record or a draft prescription (DOC-07)', async () => {
  const completion = buildCompletion();
  const { server, base } = await startServer(buildApp(completion));
  try {
    const { patientId, doctorId, appointmentId } = await seedInProgressAppointment(base);
    const record = await completion.clinicalRecordRepository.create({ appointmentId, patientId, doctorId, contentCiphertext: 'x' });

    const draftRecord = await post(`${base}/doctor/appointments/${appointmentId}/complete`, {}, doctorAuthHeaders(doctorId));
    assert.equal(draftRecord.status, 409);
    assert.equal((await json(draftRecord)).code, 'CLINICAL_RECORD_NOT_FINALIZED');

    await completion.clinicalRecordRepository.finalize(record.id, { finalizedAt: new Date(), releasedAt: null });
    await completion.prescriptionRepository.create({ appointmentId, patientId, doctorId, items: [], noMedicationNeeded: true });

    const draftPrescription = await post(`${base}/doctor/appointments/${appointmentId}/complete`, {}, doctorAuthHeaders(doctorId));
    assert.equal(draftPrescription.status, 409);
    assert.equal((await json(draftPrescription)).code, 'PRESCRIPTION_NOT_FINALIZED');
  } finally {
    server.close();
  }
});

test('only the linked doctor can complete, and only an in-progress appointment (DOC-07)', async () => {
  const { server, base } = await startServer(buildApp(buildCompletion()));
  try {
    const { doctorId, appointmentId } = await seedConfirmedAppointment(base);
    const body = { no_record_reason: 'Teste.' };

    const notStarted = await post(`${base}/doctor/appointments/${appointmentId}/complete`, body, doctorAuthHeaders(doctorId));
    assert.equal(notStarted.status, 409);
    assert.equal((await json(notStarted)).code, 'INVALID_STATUS_TRANSITION');

    await post(`${base}/doctor/appointments/${appointmentId}/start`, undefined, doctorAuthHeaders(doctorId));
    const otherDoctor = await post(
      `${base}/doctor/appointments/${appointmentId}/complete`,
      body,
      doctorAuthHeaders('00000000-0000-0000-0000-000000000000'),
    );
    assert.equal(otherDoctor.status, 403);
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
