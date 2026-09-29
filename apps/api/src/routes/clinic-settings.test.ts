import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { clinicSettingsRouter } from './clinic-settings.js';
import { InMemoryClinicSettingsRepository } from '../repositories/clinic-settings-repository.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

const JWT_SECRET = 'test-jwt-secret';
const SECRETARY_TOKEN = signSession({ sub: 'sec-1', role: 'SECRETARY' }, JWT_SECRET);
const authHeaders = { authorization: `Bearer ${SECRETARY_TOKEN}` };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TINY_PNG_BASE64 = Buffer.concat([PNG_SIGNATURE, Buffer.from('tiny')]).toString('base64');

function buildApp() {
  const repository = new InMemoryClinicSettingsRepository();
  const app: Express = express();
  // Matches index.ts: the default express.json() 100kb limit is too small for
  // a base64-encoded logo, so this route gets a higher limit specifically.
  app.use(express.json({ limit: '4mb' }));
  app.use(
    '/api/v1/clinic-settings',
    requireAuth(JWT_SECRET),
    requireRole('SECRETARY', 'ADMIN'),
    clinicSettingsRouter({ repository }),
  );
  return { app, repository };
}

async function startServer(app: Express) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/clinic-settings` };
}

function put(url: string, body: unknown) {
  return fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json', ...authHeaders }, body: JSON.stringify(body) });
}

function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test('returns null logo before anything is configured', async () => {
  const { server, base } = await startServer(buildApp().app);
  try {
    const response = await fetch(base, { headers: authHeaders });
    const body = await json(response);
    assert.equal(body.logo_base64, null);
  } finally {
    server.close();
  }
});

test('sets and retrieves the clinic logo', async () => {
  const built = buildApp();
  const { server, base } = await startServer(built.app);
  try {
    const response = await put(`${base}/logo`, { logo_base64: TINY_PNG_BASE64, content_type: 'image/png' });
    assert.equal(response.status, 200);

    const stored = await built.repository.get();
    assert.equal(stored.logoBase64, TINY_PNG_BASE64);
    assert.equal(stored.logoContentType, 'image/png');
  } finally {
    server.close();
  }
});

test('rejects a non-image content type', async () => {
  const { server, base } = await startServer(buildApp().app);
  try {
    const response = await put(`${base}/logo`, { logo_base64: TINY_PNG_BASE64, content_type: 'application/pdf' });
    assert.equal(response.status, 400);
    assert.equal((await json(response)).code, 'INVALID_CONTENT_TYPE');
  } finally {
    server.close();
  }
});

test('rejects a logo over the size limit', async () => {
  const { server, base } = await startServer(buildApp().app);
  try {
    // Just over the route's own 2MB decoded limit, but comfortably under the
    // app's express.json({ limit: '4mb' }) body-parser limit — this must be
    // rejected by the route's own MAX_LOGO_BYTES check, not by body-parser.
    const oversized = Buffer.alloc(2_200_000, 1).toString('base64');
    const response = await put(`${base}/logo`, { logo_base64: oversized, content_type: 'image/png' });
    assert.equal(response.status, 400);
    assert.equal((await json(response)).code, 'IMAGE_TOO_LARGE');
  } finally {
    server.close();
  }
});

test('rejects requests without a secretary/admin token', async () => {
  const { server, base } = await startServer(buildApp().app);
  try {
    const noToken = await fetch(base);
    assert.equal(noToken.status, 401);

    const patientToken = signSession({ sub: 'pat-1', role: 'PATIENT' }, JWT_SECRET);
    const wrongRole = await fetch(base, { headers: { authorization: `Bearer ${patientToken}` } });
    assert.equal(wrongRole.status, 403);
  } finally {
    server.close();
  }
});

test('rejects bytes that are not the declared image type', async () => {
  const { server, base } = await startServer(buildApp().app);
  try {
    const notAnImage = Buffer.from('<svg onload=alert(1)>').toString('base64');
    const asPng = await put(`${base}/logo`, { logo_base64: notAnImage, content_type: 'image/png' });
    assert.equal(asPng.status, 400);
    assert.equal((await json(asPng)).code, 'INVALID_IMAGE');

    const pngAsJpeg = await put(`${base}/logo`, { logo_base64: TINY_PNG_BASE64, content_type: 'image/jpeg' });
    assert.equal(pngAsJpeg.status, 400);

    const junkChars = await put(`${base}/logo`, { logo_base64: `${TINY_PNG_BASE64}!!<>`, content_type: 'image/png' });
    assert.equal(junkChars.status, 400);
  } finally {
    server.close();
  }
});
