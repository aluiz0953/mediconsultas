import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { accountRouter } from './account.js';
import type { AccountRepository } from '../repositories/account-repository.js';
import { InMemoryAccountRepository } from '../repositories/account-repository.memory.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { requireAuth } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';
import { hashPassword } from '../auth/password.js';

const JWT_SECRET = 'test-jwt-secret';
const CURRENT_PASSWORD = 'Senha#Forte10';

async function seedAccount(repository: AccountRepository) {
  return repository.create({
    email: 'user@example.com',
    passwordHash: await hashPassword(CURRENT_PASSWORD),
    role: 'PATIENT',
    fullName: null,
  });
}

function buildApp() {
  const accountRepository = new InMemoryAccountRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();
  const app: Express = express();
  app.use(express.json());
  app.use('/api/v1/me', requireAuth(JWT_SECRET), accountRouter({ accountRepository, auditEventRepository }));
  return { app, accountRepository, auditEventRepository };
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/me` };
}

function patch(url: string, body: unknown, token: string) {
  return fetch(url, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(url: string, token: string) {
  return fetch(url, { headers: { authorization: `Bearer ${token}` } });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('changes password when the current password is correct', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await seedAccount(built.accountRepository);
    const token = signSession({ sub: account.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await patch(
      `${base}/password`,
      { current_password: CURRENT_PASSWORD, new_password: 'NovaSenha#Forte20' },
      token,
    );
    assert.equal(response.status, 200);

    const events = await built.auditEventRepository.list({ action: 'account.password_changed' });
    assert.equal(events.length, 1);
    assert.equal(events[0].actorUserId, account.id);
  } finally {
    server.close();
  }
});

test('rejects a password change with the wrong current password', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await seedAccount(built.accountRepository);
    const token = signSession({ sub: account.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await patch(`${base}/password`, { current_password: 'wrong', new_password: 'NovaSenha#Forte20' }, token);
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test('rejects a weak new password', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await seedAccount(built.accountRepository);
    const token = signSession({ sub: account.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await patch(`${base}/password`, { current_password: CURRENT_PASSWORD, new_password: 'weak' }, token);
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('changes e-mail when unique and current password is correct', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await seedAccount(built.accountRepository);
    const token = signSession({ sub: account.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await patch(`${base}/email`, { new_email: 'new@example.com', current_password: CURRENT_PASSWORD }, token);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.email, 'new@example.com');

    const stored = await built.accountRepository.findAuthById(account.id);
    assert.equal(stored?.email, 'new@example.com');
  } finally {
    server.close();
  }
});

test('returns the account summary for the logged-in user', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await built.accountRepository.create({
      email: 'admin@example.com',
      passwordHash: await hashPassword(CURRENT_PASSWORD),
      role: 'ADMIN',
      fullName: 'Admin Um',
    });
    const token = signSession({ sub: account.id, role: 'ADMIN' }, JWT_SECRET);

    const response = await get(base, token);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.email, 'admin@example.com');
    assert.equal(body.full_name, 'Admin Um');
  } finally {
    server.close();
  }
});

test('updates the full name for a role with no dedicated profile table', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await built.accountRepository.create({
      email: 'secretary@example.com',
      passwordHash: await hashPassword(CURRENT_PASSWORD),
      role: 'SECRETARY',
      fullName: 'Nome Antigo',
    });
    const token = signSession({ sub: account.id, role: 'SECRETARY' }, JWT_SECRET);

    const response = await patch(`${base}/profile`, { full_name: 'Nome Novo' }, token);
    assert.equal(response.status, 200);

    const stored = await built.accountRepository.findSummaryById(account.id);
    assert.equal(stored?.fullName, 'Nome Novo');
  } finally {
    server.close();
  }
});

test('rejects a profile update with an empty full name', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await seedAccount(built.accountRepository);
    const token = signSession({ sub: account.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await patch(`${base}/profile`, { full_name: '   ' }, token);
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('rejects an e-mail change to an address already in use', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await built.accountRepository.create({
      email: 'taken@example.com',
      passwordHash: await hashPassword(CURRENT_PASSWORD),
      role: 'PATIENT',
      fullName: null,
    });
    const account = await seedAccount(built.accountRepository);
    const token = signSession({ sub: account.id, role: 'PATIENT' }, JWT_SECRET);

    const response = await patch(`${base}/email`, { new_email: 'taken@example.com', current_password: CURRENT_PASSWORD }, token);
    assert.equal(response.status, 409);
  } finally {
    server.close();
  }
});
