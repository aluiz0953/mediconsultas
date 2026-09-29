import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { adminAccountsRouter } from './admin-accounts.js';
import type { AccountRepository } from '../repositories/account-repository.js';
import { InMemoryAccountRepository } from '../repositories/account-repository.memory.js';
import { InMemoryPasswordResetRepository } from '../repositories/password-reset-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession, verifySession } from '../auth/token.js';
import { hashPassword } from '../auth/password.js';
import { InMemoryRoleInvitationRepository } from '../repositories/role-invitation-repository.js';
import { invitationsRouter } from './invitations.js';

const JWT_SECRET = 'test-jwt-secret';
const ADMIN_TOKEN = signSession({ sub: 'admin-1', role: 'ADMIN' }, JWT_SECRET);
const authHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };

async function seedAdmin(repository: AccountRepository, id: string) {
  const account = await repository.create({
    email: `${id}@example.com`,
    passwordHash: await hashPassword('Senha#Forte10'),
    role: 'ADMIN',
    fullName: 'Admin Seed',
  });
  await repository.updateStatus(account.id, 'ACTIVE');
  return account;
}

async function seedPatient(repository: AccountRepository) {
  const account = await repository.create({
    email: 'patient@example.com',
    passwordHash: await hashPassword('Senha#Forte10'),
    role: 'PATIENT',
    fullName: null,
  });
  await repository.updateStatus(account.id, 'ACTIVE');
  return account;
}

function buildApp() {
  const accountRepository = new InMemoryAccountRepository();
  const passwordResetRepository = new InMemoryPasswordResetRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();
  const roleInvitationRepository = new InMemoryRoleInvitationRepository();

  const app: Express = express();
  app.use(express.json());
  app.use(
    '/api/v1/admin/accounts',
    requireAuth(JWT_SECRET),
    requireRole('ADMIN'),
    adminAccountsRouter({ accountRepository, auditEventRepository, passwordResetRepository, roleInvitationRepository }),
  );
  app.use(
    '/api/v1/me/invitations',
    requireAuth(JWT_SECRET),
    invitationsRouter({ jwtSecret: JWT_SECRET, accountRepository, auditEventRepository, roleInvitationRepository }),
  );
  return { app, accountRepository, passwordResetRepository, auditEventRepository, roleInvitationRepository };
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/admin/accounts` };
}

function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });
}

function patch(url: string, body: unknown) {
  return fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('ADM-02: lists and searches accounts', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedAdmin(built.accountRepository, 'admin-a');
    await seedPatient(built.accountRepository);

    const all = await fetch(base, { headers: authHeaders });
    const allBody = await json(all);
    assert.equal((allBody.items as unknown[]).length, 2);

    const filtered = await fetch(`${base}?role=PATIENT`, { headers: authHeaders });
    const filteredBody = await json(filtered);
    assert.equal((filteredBody.items as unknown[]).length, 1);
  } finally {
    server.close();
  }
});

test('ADM-03: invites an existing account; the role only changes once the invitee accepts', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedAdmin(built.accountRepository, 'admin-a');
    const patient = await seedPatient(built.accountRepository);

    assert.equal((await post(base, { email: 'nobody@example.com', role: 'SECRETARY' })).status, 404);
    assert.equal((await post(base, { email: 'patient@example.com', role: 'SECRETARY' })).status, 201);
    assert.equal((await post(base, { email: 'patient@example.com', role: 'ADMIN' })).status, 409);
    assert.equal((await built.accountRepository.findAuthById(patient.id))?.role, 'PATIENT');

    const invitees = `${base.replace('/admin/accounts', '/me/invitations')}`;
    const inviteeAuth = { authorization: `Bearer ${signSession({ sub: patient.id, role: 'PATIENT' }, JWT_SECRET)}` };
    const pending = await json(await fetch(invitees, { headers: inviteeAuth }));
    const [invitation] = pending.items as { id: string; role: string }[];
    assert.equal(invitation.role, 'SECRETARY');

    const outsider = { authorization: `Bearer ${signSession({ sub: 'someone-else', role: 'PATIENT' }, JWT_SECRET)}` };
    assert.equal((await fetch(`${invitees}/${invitation.id}/accept`, { method: 'POST', headers: outsider })).status, 404);

    const accepted = await fetch(`${invitees}/${invitation.id}/accept`, { method: 'POST', headers: inviteeAuth });
    assert.equal(accepted.status, 200);
    assert.equal(verifySession((await json(accepted)).access_token as string, JWT_SECRET).role, 'SECRETARY');
    assert.equal((await built.accountRepository.findAuthById(patient.id))?.role, 'SECRETARY');
    assert.equal((await fetch(`${invitees}/${invitation.id}/accept`, { method: 'POST', headers: inviteeAuth })).status, 404);
  } finally {
    server.close();
  }
});

test('ADM-03: rejects inviting to DOCTOR/PATIENT roles and inviting doctor accounts', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedPatient(built.accountRepository);
    assert.equal((await post(base, { email: 'patient@example.com', role: 'DOCTOR' })).status, 400);
    const doctor = await built.accountRepository.create({ email: 'doc@example.com', passwordHash: 'x', role: 'DOCTOR', fullName: null });
    await built.accountRepository.updateStatus(doctor.id, 'ACTIVE');
    const response = await post(base, { email: 'doc@example.com', role: 'SECRETARY' });
    assert.equal(response.status, 400);
    assert.equal((await json(response)).code, 'ROLE_CHANGE_NOT_SUPPORTED');
  } finally {
    server.close();
  }
});

test('ADM-04: changes account status and requires a reason for non-ACTIVE transitions', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedAdmin(built.accountRepository, 'admin-a');
    const other = await seedAdmin(built.accountRepository, 'admin-b');

    const missingReason = await patch(`${base}/${other.id}/status`, { status: 'SUSPENDED' });
    assert.equal(missingReason.status, 400);

    const response = await patch(`${base}/${other.id}/status`, { status: 'SUSPENDED', reason: 'Solicitação do RH' });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'SUSPENDED');
  } finally {
    server.close();
  }
});

test('ADM-04: never suspends the last active admin', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const onlyAdmin = await seedAdmin(built.accountRepository, 'admin-a');

    const response = await patch(`${base}/${onlyAdmin.id}/status`, { status: 'SUSPENDED', reason: 'teste' });
    assert.equal(response.status, 409);
    const body = await json(response);
    assert.equal(body.code, 'LAST_ADMIN');
  } finally {
    server.close();
  }
});

test('ADM-05: changes role between ADMIN and SECRETARY but not for a PATIENT account', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedAdmin(built.accountRepository, 'admin-a');
    const secretary = await built.accountRepository.create({
      email: 'sec2@example.com',
      passwordHash: 'irrelevant',
      role: 'SECRETARY',
      fullName: 'Sec 2',
    });
    await built.accountRepository.updateStatus(secretary.id, 'ACTIVE');

    const promoted = await patch(`${base}/${secretary.id}/role`, { role: 'ADMIN' });
    assert.equal(promoted.status, 200);
    const promotedBody = await json(promoted);
    assert.equal(promotedBody.role, 'ADMIN');

    const patient = await seedPatient(built.accountRepository);
    const rejected = await patch(`${base}/${patient.id}/role`, { role: 'ADMIN' });
    assert.equal(rejected.status, 400);
    const rejectedBody = await json(rejected);
    assert.equal(rejectedBody.code, 'ROLE_CHANGE_NOT_SUPPORTED');
  } finally {
    server.close();
  }
});

test('removes an account: requires a reason, hides it, frees the e-mail, keeps the last admin', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  const del = (id: string, body: unknown) =>
    fetch(`${base}/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    });
  try {
    const onlyAdmin = await seedAdmin(built.accountRepository, 'admin-a');
    const patient = await seedPatient(built.accountRepository);

    assert.equal((await del(patient.id, {})).status, 400);
    assert.equal((await del(patient.id, { reason: 'cadastro duplicado' })).status, 204);

    const list = await json(await fetch(base, { headers: authHeaders }));
    assert.deepEqual((list.items as { id: string }[]).map((a) => a.id), [onlyAdmin.id]);
    assert.equal(await built.accountRepository.existsByEmail('patient@example.com'), false);
    assert.equal((await built.accountRepository.findAuthById(patient.id))?.status, 'DISABLED');
    const [removed] = await built.auditEventRepository.list({ action: 'account.removed' });
    assert.equal(removed.resourceId, patient.id);

    assert.equal((await del(patient.id, { reason: 'de novo' })).status, 404);
    const lastAdmin = await del(onlyAdmin.id, { reason: 'teste' });
    assert.equal(lastAdmin.status, 409);
  } finally {
    server.close();
  }
});

test('rejects non-admin callers', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const secretaryToken = signSession({ sub: 'sec-1', role: 'SECRETARY' }, JWT_SECRET);
    const response = await fetch(base, { headers: { authorization: `Bearer ${secretaryToken}` } });
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});
