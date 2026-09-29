import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { applySecurity, assertProductionSafe } from './security.js';

async function withApp(run: (base: string) => Promise<void>) {
  const app = express();
  applySecurity(app);
  app.post('/api/v1/auth/login', (req, res) => {
    res.status(req.headers['x-ok'] ? 200 : 401).json({});
  });
  app.get('/api/v1/ping', (_req, res) => res.json({}));
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('sets security headers and hides x-powered-by', async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/v1/ping`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});

test('login is rate limited on failures only', async () => {
  await withApp(async (base) => {
    const login = (ok: boolean) =>
      fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: ok ? { 'x-ok': '1' } : {} });
    for (let i = 0; i < 30; i++) assert.equal((await login(true)).status, 200); // successes never count
    for (let i = 0; i < 20; i++) assert.equal((await login(false)).status, 401);
    assert.equal((await login(false)).status, 429);
  });
});

test('refuses EXPOSE_VERIFICATION_CODE in production', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.EXPOSE_VERIFICATION_CODE = 'true';
    assert.throws(assertProductionSafe, /EXPOSE_VERIFICATION_CODE/);
    process.env.EXPOSE_VERIFICATION_CODE = 'false';
    assert.doesNotThrow(assertProductionSafe);
  } finally {
    process.env = saved;
  }
});

test('compresses large JSON responses but never event streams', async () => {
  const app = express();
  applySecurity(app);
  app.get('/api/v1/big', (_req, res) => res.json({ items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'x'.repeat(20) })) }));
  app.get('/api/v1/small', (_req, res) => res.json({ ok: true }));
  app.get('/api/v1/stream', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: hello\n\n'.repeat(200));
    res.end();
  });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { 'accept-encoding': 'gzip' };
    assert.equal((await fetch(`${base}/api/v1/big`, { headers })).headers.get('content-encoding'), 'gzip');
    assert.equal((await fetch(`${base}/api/v1/small`, { headers })).headers.get('content-encoding'), null);
    assert.equal((await fetch(`${base}/api/v1/stream`, { headers })).headers.get('content-encoding'), null);
  } finally {
    server.close();
  }
});

