import jwt from 'jsonwebtoken';

export interface SessionClaims {
  sub: string;
  role: string;
}

export function signSession(claims: SessionClaims, secret: string, expiresInSeconds = 1800): string {
  return jwt.sign(claims, secret, { expiresIn: expiresInSeconds });
}

export function verifySession(token: string, secret: string): SessionClaims {
  return jwt.verify(token, secret) as SessionClaims;
}
