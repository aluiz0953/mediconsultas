import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCpf, normalizeCpf } from './cpf.js';

test('accepts a valid CPF with formatting', () => {
  assert.equal(isValidCpf('111.444.777-35'), true);
});

test('accepts a valid CPF with only digits', () => {
  assert.equal(isValidCpf('11144477735'), true);
});

test('rejects a CPF with a wrong check digit', () => {
  assert.equal(isValidCpf('111.444.777-34'), false);
});

test('rejects all-repeated-digit sequences', () => {
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('000.000.000-00'), false);
});

test('rejects the wrong length', () => {
  assert.equal(isValidCpf('123456789'), false);
});

test('normalizeCpf strips formatting', () => {
  assert.equal(normalizeCpf('111.444.777-35'), '11144477735');
});
