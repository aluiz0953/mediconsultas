import type { NextFunction, Request, Response } from 'express';
import { verifySession, verifySseTicket, type SessionClaims } from './token.js';

declare global {
  namespace Express {
    interface Request {
      user?: SessionClaims;
    }
  }
}

export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
      res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Token de acesso ausente.' });
      return;
    }

    try {
      req.user = verifySession(token, jwtSecret);
      next();
    } catch {
      res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Token de acesso inválido ou expirado.' });
    }
  };
}

// SSE only: EventSource can't send an Authorization header, so the stream
// authenticates with a short-lived ?ticket= (see signSseTicket), never with the
// session token. Tickets are minted by POST /appointments/events/ticket.
export function requireSseTicket(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null;
    if (!ticket) {
      res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Ticket de acesso ausente.' });
      return;
    }

    try {
      req.user = verifySseTicket(ticket, jwtSecret);
      next();
    } catch {
      res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Ticket de acesso inválido ou expirado.' });
    }
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Sem permissão para este recurso.' });
      return;
    }
    next();
  };
}
