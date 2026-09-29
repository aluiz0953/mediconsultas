import { Router } from 'express';
import { signSseTicket, SSE_TICKET_SECONDS } from '../auth/token.js';
import { appointmentEvents, type AppointmentChangeEvent } from '../realtime/appointment-events.js';

const HEARTBEAT_MS = 25_000;
// Each stream holds a socket open, so cap them: a few per account (several tabs
// and devices) and a global ceiling so a flood of logins can't exhaust the process.
const MAX_STREAMS_PER_USER = 5;
const MAX_STREAMS_TOTAL = 1_000;
const streamsByUser = new Map<string, number>();
let streamsTotal = 0;

// Real-time queue/agenda updates: a doctor only receives events for their own
// appointments; secretary/admin (already scoped by requireRole at mount time)
// receive every change, matching what their agenda view already shows.
export function appointmentEventsRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const userId = req.user!.sub;
    if (streamsTotal >= MAX_STREAMS_TOTAL) {
      res.status(503).json({ code: 'BUSY', message: 'Servidor ocupado. Tente novamente em instantes.' });
      return;
    }
    if ((streamsByUser.get(userId) ?? 0) >= MAX_STREAMS_PER_USER) {
      res.status(429).json({ code: 'TOO_MANY_STREAMS', message: 'Muitas conexões abertas para esta conta.' });
      return;
    }
    streamsByUser.set(userId, (streamsByUser.get(userId) ?? 0) + 1);
    streamsTotal += 1;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const doctorScope = req.user!.role === 'DOCTOR' ? req.user!.sub : null;

    const listener = (event: AppointmentChangeEvent) => {
      if (doctorScope && event.doctorId !== doctorScope) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    appointmentEvents.on('change', listener);

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
      streamsTotal -= 1;
      const left = (streamsByUser.get(userId) ?? 1) - 1;
      if (left > 0) streamsByUser.set(userId, left);
      else streamsByUser.delete(userId);
      clearInterval(heartbeat);
      appointmentEvents.off('change', listener);
    });
  });

  return router;
}

// Trades the caller's session (Authorization header) for a stream ticket.
export function appointmentEventTicketRouter(jwtSecret: string): Router {
  const router = Router();
  router.post('/', (req, res) => {
    const { sub, role } = req.user!;
    res.json({ ticket: signSseTicket({ sub, role }, jwtSecret), expires_in: SSE_TICKET_SECONDS });
  });
  return router;
}
