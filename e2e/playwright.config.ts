import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

// How to run (needs a real Postgres — apps/api/.env must already point at
// one, migrated with both apps/api/migrations/*.sql files applied):
//   cd e2e
//   cp .env.example .env       # adjust ADMIN/SECRETARY creds if yours differ
//   npm install
//   npm run install-browsers   # once, downloads the Chromium binary
//   npm test
//
// Written on the Notebook (no local Postgres — see the shared session log),
// so it has only been validated statically here with `npm run test:list`
// (parses and lists the tests without starting any server). First real run
// against a live Postgres is expected to happen on the PC Principal.
//
// webServer below starts both apps/api and apps/web dev servers for you —
// set E2E_SKIP_WEB_SERVER=1 if you already have them running (e.g. two
// terminals open) and want Playwright to reuse those instead.
const skipWebServer = process.env.E2E_SKIP_WEB_SERVER === '1';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: 'npm run dev --workspace=apps/api',
          cwd: '..',
          port: 8000,
          // The suite signs in and registers many accounts from one IP.
          env: { RATE_LIMIT_DISABLED: 'true' },
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: 'npm run dev --workspace=apps/web',
          cwd: '..',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ],
});
