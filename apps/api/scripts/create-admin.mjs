// Creates the first ADMIN (accounts of that role are invite-only, so the very first one has to be
// seeded). Credentials come from the environment, never from arguments or the repo:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... [ADMIN_NAME=...] node --env-file=... apps/api/scripts/create-admin.mjs
import { pool } from '../dist/db.js'
import { hashPassword } from '../dist/auth/password.js'
import { isStrongPassword } from '../dist/validation/password-policy.js'

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD
const fullName = process.env.ADMIN_NAME?.trim() || 'Administrador'

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD.')
  process.exit(1)
}
if (!isStrongPassword(password)) {
  console.error('Weak password: at least 10 characters with lower case, upper case, a digit and a symbol.')
  process.exit(1)
}

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const taken = await client.query('SELECT 1 FROM users WHERE email = $1', [email])
  if (taken.rowCount) throw new Error(`${email} already exists`)
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, status, full_name) VALUES ($1, $2, 'ACTIVE', $3) RETURNING id`,
    [email, await hashPassword(password), fullName],
  )
  await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')`, [rows[0].id])
  await client.query('COMMIT')
  console.log(`admin created: ${email}`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
