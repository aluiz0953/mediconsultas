import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'

interface PatientAppointment {
  id: string
  doctor: { id: string; display_name: string }
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
  PATIENT_ABSENT: 'Você faltou',
  DOCTOR_ABSENT: 'Médico faltou',
}

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<PatientAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<{ items: PatientAppointment[] }>('/api/v1/patient/appointments')
      .then((data) => setAppointments(data.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar suas consultas.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Minhas consultas</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consultas passadas e futuras agendadas em seu nome.</p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Você ainda não tem nenhuma consulta.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{appointment.doctor.display_name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {new Date(appointment.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {STATUS_LABELS[appointment.status] ?? appointment.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
