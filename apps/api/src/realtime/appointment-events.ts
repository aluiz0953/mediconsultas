import { EventEmitter } from 'node:events';

export interface AppointmentChangeEvent {
  appointmentId: string;
  doctorId: string;
  status: string;
}

// ponytail: in-process EventEmitter pub/sub — fine for a single Node
// process/instance. Swap for Redis pub/sub (or similar) if the API ever runs
// as more than one instance, since events wouldn't cross process boundaries.
export const appointmentEvents = new EventEmitter();
appointmentEvents.setMaxListeners(0);

export function publishAppointmentChange(event: AppointmentChangeEvent): void {
  appointmentEvents.emit('change', event);
}
