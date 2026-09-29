import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { resetAbuseState, isBanned, strike } from './abuse.js';
import { applyFormHoneypot, applySecurity } from './security.js';

process.env.TRUST_PROXY = '1'; // tests choose the "client" address through X-Forwarded-For
const BOT = '203.0.113.7';

async function withApp(run: (base: string) => Promise<void>) {
  resetAbuseState();
  const app = express();
  applySecurity(app);
  app.use(express.json());
  applyFormHoneypot(app);
  app.get('/api/v1/ping', (_req, res) => res.json({ ok: 'real' }));
  app.post('/api/v1/patients/register', (_req, res) => res.status(201).json({ registered: true }));
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

const from = (ip: string) => ({ 'x-forwarded-for': ip });

test('a scanner probe bans the address before it can reach anything real', async () => {
  await withApp(async (base) => {
    assert.equal((await fetch(`${base}/api/v1/ping`, { headers: from(BOT) })).status, 200);
    assert.equal((await fetch(`${base}/.env`, { headers: from(BOT) })).status, 404);
    assert.equal((await fetch(`${base}/api/v1/ping`, { headers: from(BOT) })).status, 403);
    // Other clients are unaffected.
    assert.equal((await fetch(`${base}/api/v1/ping`, { headers: from('203.0.113.8') })).status, 200);
  });
});

test('honeypot paths match wildcards and admin lookalikes', async () => {
  await withApp(async (base) => {
    for (const [i, probe] of ['/wp-admin/setup.php', '/.git/config', '/api/v1/admin/backup', '/phpmyadmin/index.php'].entries()) {
      const res = await fetch(`${base}${probe}`, { headers: from(`198.51.100.${10 + i}`) });
      assert.equal(res.status, 404, probe);
    }
  });
});

test('private addresses are never banned (a proxy must not lock everyone out)', async () => {
  await withApp(async (base) => {
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/api/v1/ping`)).status, 200);
    assert.equal((await fetch(`${base}/.env`, { headers: from('10.9.9.9') })).status, 404);
    assert.equal((await fetch(`${base}/api/v1/ping`, { headers: from('10.9.9.9') })).status, 200);
  });
});

test('a filled hidden form field gets a fake success and a ban; an empty one passes', async () => {
  await withApp(async (base) => {
    const post = (body: unknown, ip: string) =>
      fetch(`${base}/api/v1/patients/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...from(ip) },
        body: JSON.stringify(body),
      });

    const human = await post({ name: 'Ana', website: '' }, '203.0.113.20');
    assert.equal(human.status, 201);

    const bot = await post({ name: 'x', website: 'http://spam.example' }, '203.0.113.21');
    assert.equal(bot.status, 200);
    assert.deepEqual(await bot.json(), { ok: true });
    assert.equal(isBanned('203.0.113.21'), true);
    assert.equal((await fetch(`${base}/api/v1/ping`, { headers: from('203.0.113.21') })).status, 403);
  });
});

test('three strikes in the window escalate to a ban', () => {
  resetAbuseState();
  strike('203.0.113.30', 'test');
  strike('203.0.113.30', 'test');
  assert.equal(isBanned('203.0.113.30'), false);
  strike('203.0.113.30', 'test');
  assert.equal(isBanned('203.0.113.30'), true);
  resetAbuseState();
});
