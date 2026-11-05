import { APPOINTMENT_STATUS_LABELS } from '../lib/appointmentStatus'

// A stamp, not a pill: bordered, uppercase. Ink is neutral; the kind shows in the border
// (dashed = waiting, solid = confirmed, double = in progress, light = done). Red only for cancel/absence.
const INK = 'text-neutral-900 dark:text-neutral-100'
const STAMP = {
  wait: `${INK} border-dashed`,
  ok: `${INK} border-solid`,
  live: `${INK} border-double border-[3px] py-0`,
  done: 'text-neutral-600 dark:text-neutral-400 border-solid border-neutral-300 dark:border-neutral-700',
  stop: 'text-red-800 dark:text-red-400 border-solid',
}

const STATUS_STAMP: Record<string, string> = {
  SCHEDULED: STAMP.wait,
  CONFIRMED: STAMP.ok,
  IN_PROGRESS: STAMP.live,
  COMPLETED: STAMP.done,
  CANCELLED: STAMP.stop,
  PATIENT_ABSENT: STAMP.stop,
  DOCTOR_ABSENT: STAMP.stop,
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border-[1.5px] border-current px-1.5 py-px text-[11px] font-semibold uppercase leading-4 tracking-wider whitespace-nowrap ${STATUS_STAMP[status] ?? STAMP.done}`}
    >
      {label ?? APPOINTMENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}
