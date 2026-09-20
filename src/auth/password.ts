import bcrypt from 'bcryptjs';

// ponytail: bcryptjs (pure JS, no native build step) instead of argon2id from
// PRD section 28.2 — swap to argon2 once the app leaves the Windows-dev-only stage.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
