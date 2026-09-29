import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { selfPatientProfileRouter } from './self-patient-profile.js';
import { InMemoryAccountRepository } from '../repositories/account-repository.memory.js';
import { InMemoryPatientRepository } from '../repositories/patient-repository.js';
import { requireAuth } from '../auth/middleware.js';
import { signSession } from '../auth/token.js';

test('a staff account can add its own patient data once and becomes searchable as a patient', async () => {
  const accountRepository = new InMemoryAccountRepository();
  const patientRepository = new InMemoryPatientRepository();
  const secretary = await accountRepository.create({ email: 'sec@example.com', passwordHash: 'x', role: 'SECRETARY', fullName: 'Sônia Secretária' });

  const app = express();
  app.use(express.json());
  app.use(
    '/me/patient-profile',
    requireAuth('jwt'),
    selfPatientProfileRouter({ accountRepository, patientRepository, cpfHmacSecret: 'cpf', fieldEncryptionKey: Buffer.alloc(32, 7).toString('base64') }),
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/me/patient-profile`;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${signSession({ sub: secretary.id, role: 'SECRETARY' }, 'jwt')}` };
  const post = (body: unknown) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

  try {
    assert.deepEqual(await (await fetch(url, { headers })).json(), { exists: false });
    assert.equal((await post({ cpf: '111.111.111-11', birth_date: '1990-01-01', phone: '11999999999' })).status, 400);

    const valid = { cpf: '529.982.247-25', birth_date: '1990-01-01', phone: '11999999999', address: '' };
    assert.equal((await post(valid)).status, 201);
    assert.equal((await post(valid)).status, 409);
    assert.deepEqual(await (await fetch(url, { headers })).json(), { exists: true });

    const [found] = await patientRepository.search('Sônia');
    assert.equal(found.id, secretary.id);
  } finally {
    server.close();
  }
});
