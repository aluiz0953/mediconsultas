import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import type { QueueStatus } from '../../components/QueueToggle'
import { AppointmentPanel } from './panels'

const QUEUE_CHIP: Record<QueueStatus, { label: string; className: string }> = {
  OPEN: { label: 'Fila aberta', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  PAUSED: { label: 'Fila pausada', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  CLOSED: { label: 'Fila fechada', className: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

// Which doctors are seeing patients right now (the doctor's own queue switch).
export function DoctorQueues() {
  const [doctors, setDoctors] = useState<{ id: string; full_name: string; specialty: string; queue_status: QueueStatus }[] | null>(null)

  useEffect(() => {
    const load = () =>
      apiFetch<{ items: { id: string; full_name: string; specialty: string; queue_status: QueueStatus }[] }>(
        '/api/v1/secretary/appointments/doctors',
      )
        .then((data) => setDoctors(data.items))
        .catch(() => setDoctors((current) => current ?? []))
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [])

  const order: Record<QueueStatus, number> = { OPEN: 0, PAUSED: 1, CLOSED: 2 }
  const sorted = [...(doctors ?? [])].sort((a, b) => order[a.queue_status] - order[b.queue_status] || a.full_name.localeCompare(b.full_name))

  return (
    <AppointmentPanel
      title={`Filas dos médicos · ${sorted.filter((d) => d.queue_status === 'OPEN').length} aberta(s), ${sorted.filter((d) => d.queue_status === 'PAUSED').length} pausada(s)`}
      loading={doctors === null}
      empty="Nenhum médico aprovado."
      scrollable
    >
      {sorted.map((doctor) => (
        <li key={doctor.id} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{doctor.full_name}</p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{doctor.specialty}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${QUEUE_CHIP[doctor.queue_status].className}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {QUEUE_CHIP[doctor.queue_status].label}
          </span>
        </li>
      ))}
    </AppointmentPanel>
  )
}
