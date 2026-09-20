import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptField, decryptField } from './field-encryption.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

test('round-trips a plaintext value', () => {
  const sealed = encryptField('11144477735', KEY);
  assert.notEqual(sealed, '11144477735');
  assert.equal(decryptField(sealed, KEY), '11144477735');
});

test('fails to decrypt with the wrong key', () => {
  const sealed = encryptField('11144477735', KEY);
  const wrongKey = Buffer.alloc(32, 9).toString('base64');
  assert.throws(() => decryptField(sealed, wrongKey));
});

test('rejects a key that is not 32 bytes', () => {
  assert.throws(() => encryptField('data', Buffer.alloc(16).toString('base64')));
});
