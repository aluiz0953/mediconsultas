import { Router } from 'express';
import { signSseTicket, SSE_TICKET_SECONDS } from '../auth/token.js';
import { appointmentEvents, type AppointmentChangeEvent } from '../realtime/appointment-events.js';

const HEARTBEAT_MS = 25_000;

// Real-time queue/agenda updates: a doctor only receives events for their own
// appointments; secretary/admin (already scoped by requireRole at mount time)
// receive every change, matching what their agenda view already shows.
export function appointmentEventsRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
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
