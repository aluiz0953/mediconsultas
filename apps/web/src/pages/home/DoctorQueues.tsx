import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import type { QueueStatus } from '../../components/QueueToggle'
import { AppointmentPanel } from './panels'

const QUEUE_CHIP: Record<QueueStatus, { label: string; className: string }> = {
  OPEN: { label: 'Fila aberta', className: 'border-solid text-neutral-900 dark:text-neutral-100' },
  PAUSED: { label: 'Fila pausada', className: 'border-dashed text-neutral-900 dark:text-neutral-100' },
  CLOSED: { label: 'Fila fechada', className: 'border-solid border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400' },
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
            <p className="truncate text-xs text-neutral-600 dark:text-neutral-400">{doctor.specialty}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-[3px] border-[1.5px] border-current px-1.5 py-px text-[11px] font-semibold uppercase leading-4 tracking-wider whitespace-nowrap ${QUEUE_CHIP[doctor.queue_status].className}`}>
            {QUEUE_CHIP[doctor.queue_status].label}
          </span>
        </li>
      ))}
    </AppointmentPanel>
  )
}
