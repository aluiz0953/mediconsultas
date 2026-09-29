// Locks the database down for production (Supabase or any Postgres). Idempotent; run as the owner role
// after scripts/migrate.mjs, with the app's own credentials in the environment:
//   APP_DB_USER=mediconsultas_app APP_DB_PASSWORD=... node --env-file=... apps/api/scripts/harden.mjs
// What it does:
//  1. Row level security on every public table, with a single policy for the app role only: anyone else
//     (Supabase anon/authenticated through the Data API) sees and changes nothing, even if a key leaks.
//  2. A least-privilege login role for the API: no superuser/createdb/createrole/bypassrls, DML only
//     (audit_events is append-only: SELECT and INSERT), no DDL, connection limit and timeouts.
//  3. No access for PUBLIC/anon/authenticated on tables and sequences (and none for anon/authenticated on
//     functions), now and by default.
import { pool } from '../dist/db.js'

const appUser = process.env.APP_DB_USER
const appPassword = process.env.APP_DB_PASSWORD
if (!appUser || !appPassword || !/^[a-z_][a-z0-9_]{2,40}$/.test(appUser)) {
  console.error('Set APP_DB_USER (lower case letters, digits, _) and APP_DB_PASSWORD.')
  process.exit(1)
}
if (appPassword.length < 24) {
  console.error('APP_DB_PASSWORD must have at least 24 characters (generate a random one).')
  process.exit(1)
}

const client = await pool.connect()
const ident = (name) => client.escapeIdentifier(name)
const appendOnly = new Set(['audit_events'])
const strangers = ['PUBLIC', 'anon', 'authenticated']

try {
  await client.query('BEGIN')
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser])
  const attributes = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20'
  const verb = existing.rowCount ? 'ALTER' : 'CREATE'
  await client.query(`${verb} ROLE ${ident(appUser)} ${attributes} PASSWORD ${client.escapeLiteral(appPassword)}`)
  await client.query(`ALTER ROLE ${ident(appUser)} SET statement_timeout = '15s'`)
  await client.query(`ALTER ROLE ${ident(appUser)} SET idle_in_transaction_session_timeout = '30s'`)

  const roles = (await client.query(`SELECT rolname FROM pg_roles WHERE rolname = ANY($1)`, [['anon', 'authenticated']])).rows.map((r) => r.rolname)
  const revokeFrom = ['PUBLIC', ...roles].join(', ')
  await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`)
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${revokeFrom}`)
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${revokeFrom}`)
  // Functions: only the Supabase API roles lose EXECUTE (PUBLIC keeps it: uuid-ossp lives in public on plain Postgres).
  if (roles.length) await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${roles.join(', ')}`)
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${revokeFrom}`)
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${revokeFrom}`)
  if (roles.length) await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${roles.join(', ')}`)

  await client.query(`GRANT USAGE ON SCHEMA public TO ${ident(appUser)}`)
  // Supabase installs extensions (uuid-ossp: uuid_generate_v4 in column defaults) in their own schema.
  if ((await client.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'extensions'`)).rowCount) {
    await client.query(`GRANT USAGE ON SCHEMA extensions TO ${ident(appUser)}`)
  }
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(appUser)}`)

  const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`)).rows
  for (const { tablename } of tables) {
    const table = `public.${ident(tablename)}`
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    await client.query(`DROP POLICY IF EXISTS app_access ON ${table}`)
    await client.query(`CREATE POLICY app_access ON ${table} FOR ALL TO ${ident(appUser)} USING (true) WITH CHECK (true)`)
    const privileges = appendOnly.has(tablename) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE, DELETE'
    await client.query(`GRANT ${privileges} ON ${table} TO ${ident(appUser)}`)
  }
  await client.query(`ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY`)
  await client.query('COMMIT')
  console.log(`hardened ${tables.length} tables; role ${appUser} is DML-only (no DDL); anon/authenticated/PUBLIC have no access`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(`failed: ${error.message}`)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
