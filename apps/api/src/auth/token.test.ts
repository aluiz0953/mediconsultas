import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession } from './token.js';

test('signSession/verifySession round-trip preserves claims', () => {
  const token = signSession({ sub: 'user-1', role: 'PATIENT' }, 'test-secret');
  const claims = verifySession(token, 'test-secret');
  assert.equal(claims.sub, 'user-1');
  assert.equal(claims.role, 'PATIENT');
});

test('verifySession rejects a token signed with a different secret', () => {
  const token = signSession({ sub: 'user-1', role: 'PATIENT' }, 'secret-a');
  assert.throws(() => verifySession(token, 'secret-b'));
});
