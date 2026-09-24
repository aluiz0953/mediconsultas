import bcrypt from 'bcrypt';

// Native bcrypt (N-API/libuv threadpool) instead of bcryptjs — the load test
// showed bcryptjs serializing hashing on the main event loop almost 1:1 with
// concurrency (a burst of logins could stall the whole API, not just login).
// PRD section 28.2 names argon2id; still on bcrypt for now, native at least
// stops it from blocking the event loop.
// Cost factor 10 (down from 12): there's no deployed prod environment yet —
// this only ever runs in dev/test — and 10 halves hash time vs. 12 with no
// real exposure tradeoff at this stage.
const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
