import { Router } from 'express';
import { pool } from '../db.js';
import { verifyPassword } from '../auth/password.js';
import { signSession } from '../auth/token.js';

export function authRouter(jwtSecret: string): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'email e senha são obrigatórios.' });
      return;
    }

    // RF-01 / PAT-03: same generic failure for "no such user" and "wrong password".
    const genericFailure = () =>
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' });

    const result = await pool.query(
      'SELECT id, password_hash, role, status FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user) {
      genericFailure();
      return;
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword || user.status !== 'ACTIVE') {
      genericFailure();
      return;
    }

    const token = signSession({ sub: user.id, role: user.role }, jwtSecret);
    res.json({ access_token: token, token_type: 'Bearer', expires_in: 1800 });
  });

  return router;
}
