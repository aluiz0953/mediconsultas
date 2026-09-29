import { Pool } from 'pg';

// Pool sized for one small instance (default 10 connections). DB_POOL_MAX must stay
// below the database's max_connections divided by the number of API instances.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
