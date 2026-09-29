import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CidrSet, ipv4ToInt, isPrivateIp, normalizeIp, parseCidr, type Cidr } from './ip.js';

test('normalizeIp unwraps IPv4-mapped IPv6 and tolerates missing values', () => {
  assert.equal(normalizeIp('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(normalizeIp('2001:DB8::1'), '2001:db8::1');
  assert.equal(normalizeIp(undefined), 'unknown');
});

test('parseCidr / ipv4ToInt reject garbage', () => {
  assert.equal(ipv4ToInt('256.1.1.1'), null);
  assert.equal(ipv4ToInt('1.2.3'), null);
  assert.equal(parseCidr('10.0.0.0/33'), null);
  assert.equal(parseCidr('nope'), null);
  assert.ok(parseCidr('198.51.100.0/24'));
});

test('CidrSet matches inside ranges only, including short prefixes', () => {
  const ranges = ['198.51.100.0/24', '203.0.113.128/25', '64.0.0.0/4'].map((c) => parseCidr(c) as Cidr);
  const set = new CidrSet(ranges);
  assert.equal(set.size, 3);
  assert.equal(set.has('198.51.100.77'), true);
  assert.equal(set.has('198.51.101.1'), false);
  assert.equal(set.has('203.0.113.200'), true);
  assert.equal(set.has('203.0.113.5'), false);
  assert.equal(set.has('70.1.2.3'), true); // /4 spans several first octets
  assert.equal(set.has('80.1.2.3'), false);
  assert.equal(set.has('2001:db8::1'), false);
});

test('isPrivateIp covers loopback, RFC1918, CGNAT, link-local and unknown', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.5', '192.168.0.9', '100.64.1.1', '169.254.1.1', '::1', 'fd00::1', 'unknown']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '203.0.113.9', '172.32.0.1', '2001:db8::1']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});
