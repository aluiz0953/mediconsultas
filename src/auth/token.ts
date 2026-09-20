import jwt from 'jsonwebtoken';

export interface SessionClaims {
  sub: string;
  role: string;
}

export function signSession(claims: SessionClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: '30m' });
}

export function verifySession(token: string, secret: string): SessionClaims {
  return jwt.verify(token, secret) as SessionClaims;
}
