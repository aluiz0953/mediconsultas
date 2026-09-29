import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { requireAuth, requireRole, requireSseTicket } from '../auth/middleware.js';
import { signSession, signSseTicket } from '../auth/token.js';
import { appointmentEventsRouter, appointmentEventTicketRouter } from './appointment-events-sse.js';

const SECRET = 'test-jwt-secret';

async function withApp(run: (base: string) => Promise<void>) {
  const app = express();
  app.use('/events/ticket', requireAuth(SECRET), requireRole('DOCTOR', 'SECRETARY', 'ADMIN'), appointmentEventTicketRouter(SECRET));
  app.use('/events', requireSseTicket(SECRET), requireRole('DOCTOR', 'SECRETARY', 'ADMIN'), appointmentEventsRouter());
  app.get('/private', requireAuth(SECRET), (_req, res) => res.json({}));
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const bearer = (role: string) => ({ authorization: `Bearer ${signSession({ sub: 'u1', role }, SECRET)}` });

test('a signed-in doctor gets a ticket that opens the stream', async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/events/ticket`, { method: 'POST', headers: bearer('DOCTOR') });
    assert.equal(res.status, 200);
    const { ticket } = (await res.json()) as { ticket: string };

    const controller = new AbortController();
    const stream = await fetch(`${base}/events?ticket=${encodeURIComponent(ticket)}`, { signal: controller.signal });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
    controller.abort();
  });
});

test('patients cannot mint a ticket, and no session means no ticket', async () => {
  await withApp(async (base) => {
    assert.equal((await fetch(`${base}/events/ticket`, { method: 'POST', headers: bearer('PATIENT') })).status, 403);
    assert.equal((await fetch(`${base}/events/ticket`, { method: 'POST' })).status, 401);
  });
});

test('the session token is not accepted on the stream URL (query or header)', async () => {
  await withApp(async (base) => {
    const session = signSession({ sub: 'u1', role: 'DOCTOR' }, SECRET);
    assert.equal((await fetch(`${base}/events?ticket=${session}`)).status, 401);
    assert.equal((await fetch(`${base}/events?token=${session}`)).status, 401);
    assert.equal((await fetch(`${base}/events`, { headers: bearer('DOCTOR') })).status, 401);
  });
});

test('a ticket is not a session token', async () => {
  await withApp(async (base) => {
    const ticket = signSseTicket({ sub: 'u1', role: 'DOCTOR' }, SECRET);
    const res = await fetch(`${base}/private`, { headers: { authorization: `Bearer ${ticket}` } });
    assert.equal(res.status, 401);
  });
});
