import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { secretaryScheduleBlocksRouter } from './secretary-schedule-blocks.js';
import { secretaryAppointmentsRouter } from './secretary-appointments.js';
import { InMemoryDoctorScheduleBlockRepository } from '../repositories/doctor-schedule-block-repository.js';
import { InMemoryAppointmentRepository } from '../repositories/appointment-repository.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { InMemoryDoctorRepository, type DoctorRepository } from '../repositories/doctor-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const JWT_SECRET = 'test-jwt-secret';
const SECRETARY_TOKEN = signSession({ sub: 'sec-1', role: 'SECRETARY' }, JWT_SECRET);
const authHeaders = { authorization: `Bearer ${SECRETARY_TOKEN}` };

async function seedApprovedDoctor(repository: DoctorRepository) {
  const doctor = await repository.create({
    fullName: 'Dra. Ana',
    email: 'ana@example.com',
    passwordHash: 'irrelevant',
    licenseNumberCiphertext: 'irrelevant',
    licenseHash: 'irrelevant-hash',
    licenseState: 'SP',
    specialty: 'Clínica Geral',
    phoneCiphertext: null,
    addressCiphertext: null,
  });
  await repository.updateApproval(doctor.id, {
    approvalStatus: 'APPROVED',
    approvalReason: null,
    approvedBy: null,
    approvedAt: new Date(),
  });
  return doctor;
}

function buildApp() {
  const blockRepository = new InMemoryDoctorScheduleBlockRepository();
  const appointmentRepository = new InMemoryAppointmentRepository();
  const patientRepository = new InMemoryPatientRepository();
  const doctorRepository = new InMemoryDoctorRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();

  const app: Express = express();
  app.use(express.json());
  app.use(
    '/api/v1/secretary/schedule-blocks',
    requireAuth(JWT_SECRET),
    requireRole('SECRETARY', 'ADMIN'),
    secretaryScheduleBlocksRouter({ blockRepository, appointmentRepository, auditEventRepository }),
  );
  app.use(
    '/api/v1/secretary/appointments',
    requireAuth(JWT_SECRET),
    requireRole('SECRETARY', 'ADMIN'),
    secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository, blockRepository }),
  );
  return { app, blockRepository, appointmentRepository, patientRepository, doctorRepository };
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1` };
}

function post(url: string, body: unknown) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders }, body: JSON.stringify(body) });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('creates a schedule block and lists it back for that day', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const doctor = await seedApprovedDoctor(built.doctorRepository);

    const response = await post(`${base}/secretary/schedule-blocks`, {
      doctor_id: doctor.id,
      starts_at: '2026-10-05T12:00:00Z',
      ends_at: '2026-10-05T13:00:00Z',
      reason: 'Feriado',
    });
    assert.equal(response.status, 201);

    const list = await fetch(`${base}/secretary/schedule-blocks?doctor_id=${doctor.id}&date=2026-10-05`, { headers: authHeaders });
    const body = await json(list);
    assert.equal((body.items as unknown[]).length, 1);
  } finally {
    server.close();
  }
});

test('rejects a block that overlaps an existing appointment', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const doctor = await seedApprovedDoctor(built.doctorRepository);
    const patient = await built.patientRepository.create({
      fullName: 'Paciente Teste',
      email: 'p@example.com',
      passwordHash: 'irrelevant',
      cpfCiphertext: 'irrelevant',
      cpfHash: 'irrelevant-hash',
      birthDate: '1990-01-01',
      phoneCiphertext: 'irrelevant',
      addressCiphertext: 'irrelevant',
      status: 'ACTIVE',
    });
    await built.appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      unitId: null,
      startsAt: new Date('2026-10-05T12:00:00Z'),
      endsAt: new Date('2026-10-05T12:30:00Z'),
      administrativeNote: null,
      createdBy: null,
    });

    const response = await post(`${base}/secretary/schedule-blocks`, {
      doctor_id: doctor.id,
      starts_at: '2026-10-05T12:00:00Z',
      ends_at: '2026-10-05T13:00:00Z',
    });
    assert.equal(response.status, 409);
    const body = await json(response);
    assert.equal(body.code, 'APPOINTMENT_IN_RANGE');
  } finally {
    server.close();
  }
});

test('rejects overlapping blocks and rejects scheduling an appointment inside a block', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const doctor = await seedApprovedDoctor(built.doctorRepository);
    const patient = await built.patientRepository.create({
      fullName: 'Paciente Teste',
      email: 'p2@example.com',
      passwordHash: 'irrelevant',
      cpfCiphertext: 'irrelevant',
      cpfHash: 'irrelevant-hash-2',
      birthDate: '1990-01-01',
      phoneCiphertext: 'irrelevant',
      addressCiphertext: 'irrelevant',
      status: 'ACTIVE',
    });

    const first = await post(`${base}/secretary/schedule-blocks`, {
      doctor_id: doctor.id,
      starts_at: '2026-10-06T12:00:00Z',
      ends_at: '2026-10-06T18:00:00Z',
      reason: 'Folga',
    });
    assert.equal(first.status, 201);

    const overlappingBlock = await post(`${base}/secretary/schedule-blocks`, {
      doctor_id: doctor.id,
      starts_at: '2026-10-06T13:00:00Z',
      ends_at: '2026-10-06T14:00:00Z',
    });
    assert.equal(overlappingBlock.status, 409);
    assert.equal((await json(overlappingBlock)).code, 'BLOCK_OVERLAPS');

    const appointmentInBlock = await post(`${base}/secretary/appointments`, {
      patient_id: patient.id,
      doctor_id: doctor.id,
      starts_at: '2026-10-06T13:00:00Z',
      ends_at: '2026-10-06T13:30:00Z',
    });
    assert.equal(appointmentInBlock.status, 409);
    assert.equal((await json(appointmentInBlock)).code, 'DOCTOR_TIME_BLOCKED');
  } finally {
    server.close();
  }
});

test('removes a block', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const doctor = await seedApprovedDoctor(built.doctorRepository);
    const created = await post(`${base}/secretary/schedule-blocks`, {
      doctor_id: doctor.id,
      starts_at: '2026-10-07T12:00:00Z',
      ends_at: '2026-10-07T13:00:00Z',
    });
    const { id } = await json(created);

    const response = await fetch(`${base}/secretary/schedule-blocks/${id}`, { method: 'DELETE', headers: authHeaders });
    assert.equal(response.status, 204);

    const stored = await built.blockRepository.findById(id as string);
    assert.equal(stored, undefined);
  } finally {
    server.close();
  }
});
