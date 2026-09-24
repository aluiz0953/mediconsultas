// Load/stress test for the API's critical read endpoints under concurrency.
//
// How to run (API must already be running — npm run dev --workspace=apps/api):
//   cd load-test
//   cp .env.example .env       # adjust ADMIN/SECRETARY creds if yours differ
//   npm install
//   npm test
//
// Scope: only endpoints that are safe to hammer repeatedly against a real,
// persistent Postgres (logins and the three read-heavy listing/query
// endpoints this session added indexes for). Write endpoints (registration,
// scheduling, finalizing records/prescriptions) are skipped on purpose —
// each request would need fresh unique data (CPF/email) to avoid uniqueness
// conflicts, and hammering them would permanently flood the real dev DB with
// synthetic rows. Add a per-request unique-data generator (see e2e/helpers.ts
// for the CPF algorithm) if write-path load testing is needed later.
import 'dotenv/config';
import autocannon from 'autocannon';

const API = process.env.LOAD_API_BASE_URL ?? 'http://localhost:8000';
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 50);
const DURATION = Number(process.env.LOAD_DURATION ?? 10);
const ADMIN_EMAIL = process.env.LOAD_ADMIN_EMAIL ?? 'admin@mediconsultas.dev';
const ADMIN_PASSWORD = process.env.LOAD_ADMIN_PASSWORD ?? 'Senha#Forte10';
const SECRETARY_EMAIL = process.env.LOAD_SECRETARY_EMAIL ?? 'secretaria@mediconsultas.dev';
const SECRETARY_PASSWORD = process.env.LOAD_SECRETARY_PASSWORD ?? 'Senha#Forte10';
const STRONG_PASSWORD = 'Senha#Forte10';

// Mirrors e2e/helpers.ts — duplicated rather than shared since these are two
// independent, standalone tools (neither is an npm workspace of the other).
function checkDigit(digits) {
  const weightStart = digits.length + 1;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits[i] * (weightStart - i);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}
function generateValidCpf() {
  let base;
  do {
    base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  } while (base.every((d) => d === base[0]));
  const d1 = checkDigit(base);
  const d2 = checkDigit([...base, d1]);
  return [...base, d1, d2].join('');
}

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function login(email, password) {
  const { access_token } = await api('POST', '/api/v1/auth/login', { email, password });
  return access_token;
}

async function setup() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const secretaryToken = await login(SECRETARY_EMAIL, SECRETARY_PASSWORD);

  // No seeded doctor account exists — register + approve a throwaway one
  // (same DOC-01-has-no-UI-form workaround the E2E suite uses).
  const suffix = Date.now();
  const doctorEmail = `load.test.doctor.${suffix}@example.com`;
  const doctor = await api('POST', '/api/v1/doctors/register', {
    full_name: `Dr Load Test ${suffix}`,
    license_number: `CRM-LOAD-${suffix}`,
    license_state: 'SP',
    specialty: 'Clínica Geral',
    email: doctorEmail,
    password: STRONG_PASSWORD,
  });
  await api('POST', `/api/v1/admin/doctors/${doctor.id}/approve`, {}, adminToken);
  const doctorToken = await login(doctorEmail, STRONG_PASSWORD);

  return { adminToken, secretaryToken, doctorToken };
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function summarize(name, result) {
  const nonOk = (result['1xx'] ?? 0) + (result['3xx'] ?? 0) + (result['4xx'] ?? 0) + (result['5xx'] ?? 0);
  const errors = result.errors ?? 0;
  const timeouts = result.timeouts ?? 0;
  const p99 = result.latency.p99;
  const ok = errors === 0 && timeouts === 0 && nonOk === 0 && p99 < 500;

  console.log(`\n--- ${name} ---`);
  console.log(`  req/sec avg: ${result.requests.average.toFixed(1)}  total: ${result.requests.total}`);
  console.log(`  latency ms  avg: ${result.latency.average.toFixed(2)}  p50: ${result.latency.p50}  p99: ${p99}  max: ${result.latency.max}`);
  console.log(`  errors: ${errors}  timeouts: ${timeouts}  non-2xx: ${nonOk}`);
  if (result.requests.total === 0) {
    console.log('  CRITICAL: not a single request completed within the test window — every');
    console.log('  connection was still waiting when the run ended. See the note at the end.');
  } else {
    console.log(`  ${ok ? 'PASS' : 'WARN'} (threshold: 0 errors/timeouts/non-2xx, p99 < 500ms)`);
  }
  return ok;
}

async function run(name, opts) {
  const result = await autocannon({ connections: CONNECTIONS, duration: DURATION, ...opts });
  return summarize(name, result);
}

console.log(`Load test against ${API} — ${CONNECTIONS} connections, ${DURATION}s per endpoint\n`);
console.log('Setting up auth tokens (admin/secretary login, throwaway doctor registration)...');
const { adminToken, secretaryToken, doctorToken } = await setup();
console.log('Setup complete.\n');

const results = [];

// Login goes last: even with native bcrypt (see auth/password.ts) off the
// main event loop, bcrypt's own CPU cost under 50 concurrent logins still
// queues up on libuv's threadpool for seconds — running it last keeps that
// from skewing the other three endpoints' readings.
results.push(
  await run('GET /api/v1/secretary/appointments (agenda, with search)', {
    url: `${API}/api/v1/secretary/appointments?date=${today()}&search=a`,
    method: 'GET',
    headers: { authorization: `Bearer ${secretaryToken}` },
  }),
);

results.push(
  await run('GET /api/v1/doctor/appointments (queue)', {
    url: `${API}/api/v1/doctor/appointments?date=${today()}`,
    method: 'GET',
    headers: { authorization: `Bearer ${doctorToken}` },
  }),
);

results.push(
  await run('GET /api/v1/admin/audit-events (audit query)', {
    url: `${API}/api/v1/admin/audit-events`,
    method: 'GET',
    headers: { authorization: `Bearer ${adminToken}` },
  }),
);

results.push(
  await run('POST /api/v1/auth/login (admin credentials)', {
    url: `${API}/api/v1/auth/login`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }),
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} endpoints within threshold.`);
console.log(
  '\nNote: login is expected to WARN on p99 latency even though it PASSes on\n' +
    'errors/timeouts. Native bcrypt (auth/password.ts, cost factor 10) no longer\n' +
    'blocks the event loop — the other three endpoints stay fast regardless of\n' +
    'what login is doing — but bcrypt itself is still deliberately CPU-slow, and\n' +
    '50 concurrent logins queue up on libuv\'s threadpool. That queueing, not an\n' +
    'event-loop stall, is why login\'s own latency stays high; it is not a bug.',
);
process.exit(passed === results.length ? 0 : 1);
