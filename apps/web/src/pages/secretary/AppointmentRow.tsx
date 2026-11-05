import { useState } from 'react'
import { StatusBadge } from '../../components/StatusBadge'

export interface Appointment {
  id: string
  patient: { id: string; display_name: string }
  doctor: { id: string; display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// One ficha strip of the day's agenda: time, who, status stamp, and the actions that still make
// sense. Confirm and cancel sit at opposite ends so one cannot be hit by reaching for the other.
// When a live update changes the status, the stamp flips once (like a departure board).
export function AppointmentRow({
  appointment,
  onConfirm,
  onCancel,
}: {
  appointment: Appointment
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
}) {
  const open = appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'
  const [firstStatus] = useState(appointment.status)
  const changed = firstStatus !== appointment.status
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-md border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-[88px_minmax(0,1fr)_auto]">
      <div>
        <p className="text-lg font-semibold leading-tight text-neutral-900 dark:text-white">{time(appointment.starts_at)}</p>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">até {time(appointment.ends_at)}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-neutral-900 dark:text-white">{appointment.patient.display_name}</p>
        <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">com {appointment.doctor.display_name}</p>
        <div className="mt-1.5">
          <span key={appointment.status} className={`inline-block ${changed ? 'status-flip' : ''}`}>
            <StatusBadge status={appointment.status} />
          </span>
        </div>
      </div>

      {open && (
        <div className="col-span-2 flex shrink-0 items-center justify-between gap-6 border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-800 sm:col-span-1 sm:w-64 sm:border-0 sm:pt-0">
          {appointment.status === 'SCHEDULED' ? (
            <button
              type="button"
              onClick={() => onConfirm(appointment.id)}
              className="rounded-md bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Confirmar
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onCancel(appointment.id)}
            className="rounded-md px-3 py-2 text-sm font-medium text-red-800 underline-offset-4 transition hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 dark:text-red-400"
          >
            Cancelar
          </button>
        </div>
      )}
    </li>
  )
}
