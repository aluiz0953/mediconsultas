import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError, apiUrl } from '../../lib/api'
import { getToken } from '../../lib/auth'
import { PageHeader } from '../../components/PageHeader'
import { QueueToggle, type QueueStatus } from '../../components/QueueToggle'
import { StatusBadge, APPOINTMENT_STATUS_LABELS } from '../../components/StatusBadge'

interface QueueAppointment {
  id: string
  patient: { id: string; display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

function todayIsoDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function QueuePage() {
  const navigate = useNavigate()
  const [date, setDate] = useState(todayIsoDate)
  const [appointments, setAppointments] = useState<QueueAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startingId, setStartingId] = useState<string | null>(null)
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('CLOSED')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ date })
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      const data = await apiFetch<{ items: QueueAppointment[] }>(`/api/v1/doctor/appointments?${params.toString()}`)
      setAppointments(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a fila de atendimento.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, search, statusFilter])

  // Real-time: the secretary confirming/cancelling an appointment updates
  // this queue instantly, without the doctor needing to refresh manually.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const source = new EventSource(apiUrl(`/api/v1/appointments/events?token=${encodeURIComponent(token)}`))
    source.onmessage = () => load()
    return () => source.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function start(appointmentId: string) {
    setStartingId(appointmentId)
    setError('')
    try {
      await apiFetch(`/api/v1/doctor/appointments/${appointmentId}/start`, { method: 'POST' })
      navigate(`/doctor/appointments/${appointmentId}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao iniciar atendimento.')
      setStartingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Fila de atendimento"
        subtitle="Consultas confirmadas para o dia."
        action={<QueueToggle onChange={setQueueStatus} />}
      />
      {queueStatus === 'PAUSED' && (
        <p role="status" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          Fila pausada. Nenhum atendimento novo pode ser iniciado até você retomar a fila.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou CPF"
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        >
          <option value="">Todos os status</option>
          {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Nenhuma consulta nesta data.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">
                  {new Date(appointment.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {appointment.patient.display_name}
                </p>
                <div className="mt-1.5">
                  <StatusBadge status={appointment.status} />
                </div>
              </div>

              {appointment.status === 'CONFIRMED' && (
                <button
                  type="button"
                  disabled={startingId === appointment.id || queueStatus === 'PAUSED'}
                  onClick={() => start(appointment.id)}
                  className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Iniciar atendimento
                </button>
              )}
              {appointment.status === 'IN_PROGRESS' && (
                <button
                  type="button"
                  onClick={() => navigate(`/doctor/appointments/${appointment.id}`)}
                  className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Continuar atendimento
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
