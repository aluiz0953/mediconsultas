import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { SkeletonRows } from '../../components/Skeleton'

interface PatientAppointment {
  id: string
  doctor: { id: string; display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

// PATIENT_ABSENT reads as "Você faltou" here — first person, since this is
// the patient's own view — unlike the shared "Paciente faltou" used by
// staff-facing screens (StatusBadge's default).
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
      <PageHeader
        title="Minhas consultas"
        subtitle="Consultas passadas e futuras agendadas em seu nome."
      />

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows count={3} className="mt-4" />
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Você ainda não tem nenhuma consulta.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{appointment.doctor.display_name}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {new Date(appointment.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <StatusBadge status={appointment.status} label={STATUS_LABELS[appointment.status]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
