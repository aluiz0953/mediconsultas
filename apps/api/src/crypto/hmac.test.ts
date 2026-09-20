import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hmacSha256Hex } from './hmac.js';

test('is deterministic for the same value and secret', () => {
  assert.equal(hmacSha256Hex('11144477735', 'secret-a'), hmacSha256Hex('11144477735', 'secret-a'));
});

test('differs when the secret differs', () => {
  assert.notEqual(hmacSha256Hex('11144477735', 'secret-a'), hmacSha256Hex('11144477735', 'secret-b'));
});

test('differs when the value differs', () => {
  assert.notEqual(hmacSha256Hex('11144477735', 'secret-a'), hmacSha256Hex('22233388846', 'secret-a'));
});
