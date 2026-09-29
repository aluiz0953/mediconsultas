// Applies apps/api/migrations/*.sql in order, once each (tracked in schema_migrations), so a fresh
// database (e.g. Supabase) can be set up without psql. Run after `npm run build -w apps/api`:
//   node --env-file=apps/api/.env.supabase apps/api/scripts/migrate.mjs [--rls]
// --rls turns on row level security (no policies) for every public table: Supabase exposes the
// public schema through its Data API, and the API here connects as the owner (which bypasses RLS).
import { readdirSync, readFileSync } from 'node:fs'
import { pool } from '../dist/db.js'

const dir = new URL('../migrations/', import.meta.url)

await pool.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
)
const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name))

if (done.size === 0) {
  const existing = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`)
  if (existing.rowCount) {
    console.error('This database already has tables but no migration history: refusing to re-apply 001. Use an empty database.')
    process.exit(1)
  }
}

for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
  if (done.has(file)) continue
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(readFileSync(new URL(file, dir), 'utf8'))
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    await client.query('COMMIT')
    console.log(`applied ${file}`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`failed ${file}: ${error.message}`)
    process.exitCode = 1
    break
  } finally {
    client.release()
  }
}

if (process.argv.includes('--rls') && !process.exitCode) {
  const tables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
  for (const { tablename } of tables.rows) {
    await pool.query(`ALTER TABLE public."${tablename.replace(/"/g, '""')}" ENABLE ROW LEVEL SECURITY`)
  }
  console.log(`row level security on for ${tables.rowCount} tables`)
}

await pool.end()
