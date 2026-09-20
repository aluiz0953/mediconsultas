import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStrongPassword } from './password-policy.js';

test('accepts a password with lower, upper, digit and symbol at 10+ chars', () => {
  assert.equal(isStrongPassword('Senha#Forte10'), true);
});

test('rejects a password shorter than 10 chars', () => {
  assert.equal(isStrongPassword('Ab1#efg'), false);
});

test('rejects a password missing a symbol', () => {
  assert.equal(isStrongPassword('SenhaForte10'), false);
});

test('rejects a password missing an uppercase letter', () => {
  assert.equal(isStrongPassword('senha#forte10'), false);
});
