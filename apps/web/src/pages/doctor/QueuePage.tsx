import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError } from '../../lib/api'

interface QueueAppointment {
  id: string
  patient: { id: string; display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
  PATIENT_ABSENT: 'Paciente faltou',
  DOCTOR_ABSENT: 'Médico faltou',
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

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ items: QueueAppointment[] }>(`/api/v1/doctor/appointments?date=${date}`)
      setAppointments(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a fila de atendimento.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
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
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Fila de atendimento</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consultas confirmadas para o dia.</p>

      <div className="mt-4">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Nenhuma consulta nesta data.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {new Date(appointment.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {appointment.patient.display_name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {STATUS_LABELS[appointment.status] ?? appointment.status}
                </p>
              </div>

              {appointment.status === 'CONFIRMED' && (
                <button
                  type="button"
                  disabled={startingId === appointment.id}
                  onClick={() => start(appointment.id)}
                  className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Iniciar atendimento
                </button>
              )}
              {appointment.status === 'IN_PROGRESS' && (
                <button
                  type="button"
                  onClick={() => navigate(`/doctor/appointments/${appointment.id}`)}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
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
