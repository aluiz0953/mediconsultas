import { APPOINTMENT_STATUS_LABELS } from '../lib/appointmentStatus'

const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  IN_PROGRESS: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  COMPLETED: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  PATIENT_ABSENT: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  DOCTOR_ABSENT: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status] ?? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? APPOINTMENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}
