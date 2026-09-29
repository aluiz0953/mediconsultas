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

// One line of the day's agenda: who, when, status, and the confirm/cancel actions that
// still make sense for that status.
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
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <p className="font-medium text-neutral-900 dark:text-white">
          {time(appointment.starts_at)}
          {' – '}
          {time(appointment.ends_at)}
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {appointment.patient.display_name} com {appointment.doctor.display_name}
        </p>
        <div className="mt-1.5">
          <StatusBadge status={appointment.status} />
        </div>
      </div>

      {open && (
        <div className="flex shrink-0 gap-2">
          {appointment.status === 'SCHEDULED' && (
            <button
              type="button"
              onClick={() => onConfirm(appointment.id)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Confirmar
            </button>
          )}
          <button
            type="button"
            onClick={() => onCancel(appointment.id)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancelar
          </button>
        </div>
      )}
    </li>
  )
}
