import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from './uuid.js';

test('isUuid accepts UUIDs and rejects everything else', () => {
  assert.equal(isUuid('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isUuid('123E4567-E89B-12D3-A456-426614174000'), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid("123e4567-e89b-12d3-a456-42661417400'; DROP"), false);
  assert.equal(isUuid(undefined), false);
});
