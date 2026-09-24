import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { consumeVerification, verificationsRouter } from './verifications.js';
import { patientsRouter } from './patients.js';
import { InMemoryContactVerificationRepository } from '../repositories/contact-verification-repository.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';

test('sign-up needs a confirmed code for the same e-mail/phone, usable only once', async () => {
  const repository = new InMemoryContactVerificationRepository();
  const sent: string[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/v',
    verificationsRouter({ repository, codeHmacSecret: 'secret', sendCode: ({ code }) => sent.push(code) }),
  );
  app.use(
    '/p',
    patientsRouter({
      repository: new InMemoryPatientRepository(),
      cpfHmacSecret: 'cpf',
      fieldEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
      verifyContact: (id, contact) => consumeVerification(repository, id, contact),
    }),
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  try {
    assert.equal((await post('/v', { channel: 'sms', destination: '123' })).status, 400);

    const sms = await post('/v', { channel: 'sms', destination: '(11) 99999-8888' });
    assert.equal(sms.status, 201);
    const { id, dev_code } = (await sms.json()) as { id: string; dev_code?: string };
    assert.equal(dev_code, undefined, 'code is never echoed unless exposeCode is on');
    assert.equal((await post('/v', { channel: 'sms', destination: '11999998888' })).status, 429, 'resend cooldown');

    assert.equal((await post(`/v/${id}/confirm`, { code: '000000' === sent[0] ? '111111' : '000000' })).status, 400);

    const patient = {
      full_name: 'Maria Teste',
      cpf: '529.982.247-25',
      birth_date: '1990-01-01',
      email: 'maria.teste@example.com',
      phone: '11 99999-8888',
      address: 'Rua A, 1',
      password: 'Senha#Forte10',
    };
    assert.equal((await post('/p/register', { ...patient, verification_id: id })).status, 400, 'not confirmed yet');

    assert.equal((await post(`/v/${id}/confirm`, { code: sent[0] })).status, 200);
    assert.equal(
      (await post('/p/register', { ...patient, phone: '11 90000-0000', verification_id: id })).status,
      400,
      'verified phone must match the registered one',
    );
    assert.equal((await post('/p/register', { ...patient, verification_id: id })).status, 201);
    assert.equal(
      (await post('/p/register', { ...patient, email: 'outra@example.com', cpf: '111.444.777-35', verification_id: id })).status,
      400,
      'a verification is single-use',
    );
  } finally {
    server.close();
  }
});
