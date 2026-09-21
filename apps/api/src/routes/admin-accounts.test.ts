import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { adminAccountsRouter } from './admin-accounts.js';
import { InMemoryAccountRepository, type AccountRepository } from '../repositories/account-repository.js';
import { InMemoryPasswordResetRepository } from '../repositories/password-reset-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';
import { hashPassword } from '../auth/password.js';
import type { SendPasswordResetLink } from '../notifications/mailer.js';

const JWT_SECRET = 'test-jwt-secret';
const RESET_TOKEN_HMAC_SECRET = 'test-reset-secret';
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
  const sentLinks: { email: string; token: string; purpose: string }[] = [];
  const sendPasswordResetLink: SendPasswordResetLink = (params) => sentLinks.push(params);

  const app: Express = express();
  app.use(express.json());
  app.use(
    '/api/v1/admin/accounts',
    requireAuth(JWT_SECRET),
    requireRole('ADMIN'),
    adminAccountsRouter({
      accountRepository,
      auditEventRepository,
      passwordResetRepository,
      resetTokenHmacSecret: RESET_TOKEN_HMAC_SECRET,
      sendPasswordResetLink,
    }),
  );
  return { app, accountRepository, passwordResetRepository, auditEventRepository, sentLinks };
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

test('ADM-03: invites a SECRETARY account without the admin ever setting its password', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const response = await post(base, { email: 'sec@example.com', full_name: 'Secretária Nova', role: 'SECRETARY' });
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.status, 'PENDING');

    assert.equal(built.sentLinks.length, 1);
    assert.equal(built.sentLinks[0].purpose, 'invite');

    const events = await built.auditEventRepository.list({ action: 'account.invited' });
    assert.equal(events.length, 1);
  } finally {
    server.close();
  }
});

test('ADM-03: rejects inviting a DOCTOR or PATIENT (self-registration covers those)', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const response = await post(base, { email: 'doc@example.com', full_name: 'Novo Médico', role: 'DOCTOR' });
    assert.equal(response.status, 400);
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
