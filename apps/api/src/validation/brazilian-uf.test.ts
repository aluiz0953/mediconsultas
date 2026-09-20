import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidBrazilianUf } from './brazilian-uf.js';

test('accepts a valid UF', () => {
  assert.equal(isValidBrazilianUf('SP'), true);
  assert.equal(isValidBrazilianUf('sp'), true);
});

test('rejects an invalid UF', () => {
  assert.equal(isValidBrazilianUf('XX'), false);
  assert.equal(isValidBrazilianUf(''), false);
});
