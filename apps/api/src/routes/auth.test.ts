import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { authRouter } from './auth.js';
import { InMemoryAccountRepository, type AccountRepository } from '../repositories/account-repository.js';
import { InMemoryPasswordResetRepository } from '../repositories/password-reset-repository.js';
import { InMemoryAuditEventRepository } from '../repositories/audit-event-repository.js';
import { hashPassword } from '../auth/password.js';
import type { SendPasswordResetLink } from '../notifications/mailer.js';

const JWT_SECRET = 'test-jwt-secret';
const RESET_TOKEN_HMAC_SECRET = 'test-reset-secret';
const PASSWORD = 'Senha#Forte10';

async function seedActiveAccount(repository: AccountRepository) {
  const account = await repository.create({
    email: 'user@example.com',
    passwordHash: await hashPassword(PASSWORD),
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
    '/api/v1/auth',
    authRouter({
      jwtSecret: JWT_SECRET,
      accountRepository,
      passwordResetRepository,
      auditEventRepository,
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
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/auth` };
}

function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('logs in with correct credentials', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);
    const response = await post(`${base}/login`, { email: 'user@example.com', password: PASSWORD });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.ok(body.access_token);
  } finally {
    server.close();
  }
});

test('returns a generic 401 for a wrong password, without revealing the account exists', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);
    const wrongPassword = await post(`${base}/login`, { email: 'user@example.com', password: 'wrong-password' });
    assert.equal(wrongPassword.status, 401);

    const noSuchUser = await post(`${base}/login`, { email: 'nobody@example.com', password: PASSWORD });
    assert.equal(noSuchUser.status, 401);
    assert.deepEqual(await json(wrongPassword), await json(noSuchUser));
  } finally {
    server.close();
  }
});

test('RF-01: locks the account out after 5 failed attempts', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const account = await seedActiveAccount(built.accountRepository);

    for (let i = 0; i < 5; i++) {
      const response = await post(`${base}/login`, { email: 'user@example.com', password: 'wrong' });
      assert.equal(response.status, 401);
    }

    const lockedOut = await post(`${base}/login`, { email: 'user@example.com', password: PASSWORD });
    assert.equal(lockedOut.status, 423);

    const stored = await built.accountRepository.findAuthById(account.id);
    assert.ok(stored?.lockedUntil);
  } finally {
    server.close();
  }
});

test('"remember me" issues a long-lived session instead of the 30-minute default', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);

    const normal = await post(`${base}/login`, { email: 'user@example.com', password: PASSWORD });
    const normalBody = await json(normal);
    assert.equal(normalBody.expires_in, 1800);

    const remembered = await post(`${base}/login`, { email: 'user@example.com', password: PASSWORD, remember_me: true });
    const rememberedBody = await json(remembered);
    assert.equal(rememberedBody.expires_in, 30 * 24 * 60 * 60);
    assert.notEqual(rememberedBody.expires_in, normalBody.expires_in);
  } finally {
    server.close();
  }
});

test('a successful login resets the failed-attempt counter', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);
    await post(`${base}/login`, { email: 'user@example.com', password: 'wrong' });
    await post(`${base}/login`, { email: 'user@example.com', password: 'wrong' });

    const success = await post(`${base}/login`, { email: 'user@example.com', password: PASSWORD });
    assert.equal(success.status, 200);

    const account = await built.accountRepository.findAuthByEmail('user@example.com');
    assert.equal(account?.failedLoginCount, 0);
  } finally {
    server.close();
  }
});

test('PAT-03: password reset request always returns a generic response', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);

    const existing = await post(`${base}/password-reset/request`, { email: 'user@example.com' });
    const missing = await post(`${base}/password-reset/request`, { email: 'nobody@example.com' });
    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.deepEqual(await json(existing), await json(missing));

    assert.equal(built.sentLinks.length, 1);
    assert.equal(built.sentLinks[0].email, 'user@example.com');
  } finally {
    server.close();
  }
});

test('PAT-03: confirms a password reset with a valid token and lets the user log in with the new password', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);
    await post(`${base}/password-reset/request`, { email: 'user@example.com' });
    const token = built.sentLinks[0].token;

    const confirm = await post(`${base}/password-reset/confirm`, { token, new_password: 'NovaSenha#Forte20' });
    assert.equal(confirm.status, 200);

    const oldPasswordLogin = await post(`${base}/login`, { email: 'user@example.com', password: PASSWORD });
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await post(`${base}/login`, { email: 'user@example.com', password: 'NovaSenha#Forte20' });
    assert.equal(newPasswordLogin.status, 200);
  } finally {
    server.close();
  }
});

test('PAT-03: a reset token cannot be used twice', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    await seedActiveAccount(built.accountRepository);
    await post(`${base}/password-reset/request`, { email: 'user@example.com' });
    const token = built.sentLinks[0].token;

    const first = await post(`${base}/password-reset/confirm`, { token, new_password: 'NovaSenha#Forte20' });
    assert.equal(first.status, 200);

    const second = await post(`${base}/password-reset/confirm`, { token, new_password: 'OutraSenha#Forte30' });
    assert.equal(second.status, 400);
  } finally {
    server.close();
  }
});

test('PAT-03: rejects an unknown or expired token', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const response = await post(`${base}/password-reset/confirm`, { token: 'not-a-real-token', new_password: 'NovaSenha#Forte20' });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});
