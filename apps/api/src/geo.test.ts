import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { loadAccessConfig, type AccessConfig } from './geo.js';
import { CidrSet, parseCidr, type Cidr } from './ip.js';
import { applySecurity } from './security.js';

process.env.TRUST_PROXY = '1';

const config = (over: Partial<AccessConfig> = {}): AccessConfig => ({
  allowedCountries: ['BR'],
  blockVpn: true,
  vpnRanges: new CidrSet([parseCidr('198.51.100.0/24') as Cidr]),
  bypass: new Set(['203.0.113.99']),
  // The test picks the "country" through a header; production uses GeoIP or a CDN header.
  countryOf: (_ip, req) => (typeof req.headers['x-test-country'] === 'string' ? req.headers['x-test-country'].toUpperCase() : null),
  ...over,
});

async function status(cfg: AccessConfig, headers: Record<string, string>) {
  const app = express();
  applySecurity(app, cfg);
  app.get('/api/v1/ping', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ping`, { headers });
    return res.status;
  } finally {
    server.close();
  }
}

test('allows Brazil, blocks other countries, lets unknown through', async () => {
  const c = config();
  assert.equal(await status(c, { 'x-forwarded-for': '203.0.113.5', 'x-test-country': 'BR' }), 200);
  assert.equal(await status(c, { 'x-forwarded-for': '203.0.113.5', 'x-test-country': 'US' }), 403);
  assert.equal(await status(c, { 'x-forwarded-for': '203.0.113.5', 'x-test-country': 'T1' }), 403);
  assert.equal(await status(c, { 'x-forwarded-for': '203.0.113.5' }), 200);
});

test('blocks addresses on the VPN list even from Brazil', async () => {
  const c = config();
  assert.equal(await status(c, { 'x-forwarded-for': '198.51.100.42', 'x-test-country': 'BR' }), 403);
  assert.equal(await status(config({ blockVpn: false }), { 'x-forwarded-for': '198.51.100.42', 'x-test-country': 'BR' }), 200);
});

test('private addresses and the bypass list are never restricted', async () => {
  const c = config();
  assert.equal(await status(c, { 'x-test-country': 'US' }), 200); // loopback
  assert.equal(await status(c, { 'x-forwarded-for': '10.1.1.1', 'x-test-country': 'US' }), 200);
  assert.equal(await status(c, { 'x-forwarded-for': '203.0.113.99', 'x-test-country': 'US' }), 200);
});

test('defaults: production restricts to BR and blocks VPNs, development restricts nothing', async () => {
  const prod = await loadAccessConfig({ NODE_ENV: 'production', VPN_LIST_PATH: 'does-not-exist.txt' });
  assert.deepEqual(prod.allowedCountries, ['BR']);
  assert.equal(prod.blockVpn, true);
  const dev = await loadAccessConfig({ NODE_ENV: 'development' });
  assert.deepEqual(dev.allowedCountries, []);
  assert.equal(dev.blockVpn, false);
});

test('the CDN country header is only trusted when explicitly enabled', async () => {
  const req = (value: string) => ({ headers: { 'cf-ipcountry': value } }) as never;
  const off = await loadAccessConfig({ NODE_ENV: 'production', BLOCK_VPN: 'false' });
  assert.equal(off.countryOf('203.0.113.5', req('US')), null);
  const on = await loadAccessConfig({ NODE_ENV: 'production', BLOCK_VPN: 'false', GEO_TRUST_HEADER: 'true' });
  assert.equal(on.countryOf('203.0.113.5', req('us')), 'US');
  assert.equal(on.countryOf('203.0.113.5', req('T1')), 'T1');
  assert.equal(on.countryOf('203.0.113.5', req('XX')), null);
});
