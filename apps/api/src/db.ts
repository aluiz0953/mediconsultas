import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

// Managed Postgres (Supabase, ...) requires TLS. DATABASE_SSL_CA_PATH pins the provider's CA and keeps
// full certificate verification; DATABASE_SSL=true verifies against the system CAs. Do not put
// ?sslmode= in DATABASE_URL: pg lets the URL override these settings.
const ssl = process.env.DATABASE_SSL_CA_PATH
  ? { ca: readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8') }
  : process.env.DATABASE_SSL === 'true'
    ? true
    : undefined;

// Pool sized for one small instance (default 10 connections). DB_POOL_MAX must stay
// below the database's max_connections divided by the number of API instances.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  // Fail fast when the pool is exhausted instead of queueing requests forever.
  connectionTimeoutMillis: 5_000,
  // A runaway query is cut off instead of holding a connection indefinitely.
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
});

// Without a listener, an error on an idle connection (database restart, network
// blip) would crash the whole process.
pool.on('error', (err) => {
  process.stderr.write(`${JSON.stringify({ event: 'db.pool-error', message: err.message })}\n`);
});
