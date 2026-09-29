import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CachedClinicSettingsRepository,
  InMemoryClinicSettingsRepository,
  type ClinicSettings,
} from './clinic-settings-repository.js';

class CountingRepository extends InMemoryClinicSettingsRepository {
  reads = 0;
  override async get(): Promise<ClinicSettings> {
    this.reads += 1;
    return super.get();
  }
}

test('reads hit the database once, updates refresh the cache', async () => {
  const inner = new CountingRepository();
  const cached = new CachedClinicSettingsRepository(inner);

  await cached.get();
  await cached.get();
  assert.equal(inner.reads, 1);

  await cached.updateLogo('AAAA', 'image/png', 'user-1');
  assert.equal((await cached.get()).logoBase64, 'AAAA');
  assert.equal(inner.reads, 1, 'the update result is served from cache, no extra read');
});

test('the cache expires after its TTL', async () => {
  const inner = new CountingRepository();
  const cached = new CachedClinicSettingsRepository(inner, 20);
  await cached.get();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await cached.get();
  assert.equal(inner.reads, 2);
});
