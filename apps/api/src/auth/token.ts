import jwt from 'jsonwebtoken';

export interface SessionClaims {
  sub: string;
  role: string;
}

export function signSession(claims: SessionClaims, secret: string, expiresInSeconds = 1800): string {
  return jwt.sign(claims, secret, { expiresIn: expiresInSeconds, algorithm: 'HS256' });
}

export function verifySession(token: string, secret: string): SessionClaims {
  // Pin the algorithm: never let the token pick how it is verified.
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as SessionClaims;
}

// Short-lived, single-purpose credential for opening the SSE stream. The
// browser's EventSource can't send headers, so the stream URL has to carry a
// credential; that URL ends up in logs and history, so it must never be the
// session token. Signed with a derived key so a ticket is not a valid session
// token (and vice versa).
export const SSE_TICKET_SECONDS = 30;
const ticketKey = (secret: string) => `${secret}:sse-ticket`;

export function signSseTicket(claims: SessionClaims, secret: string): string {
  return signSession(claims, ticketKey(secret), SSE_TICKET_SECONDS);
}

export function verifySseTicket(ticket: string, secret: string): SessionClaims {
  return verifySession(ticket, ticketKey(secret));
}
