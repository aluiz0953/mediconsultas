import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { QueueToggle } from '../../components/QueueToggle'
import { StatCard } from '../../components/StatCard'
import { CalendarIcon, ClockIcon, UsersIcon } from '../../components/icons'
import { ACTIVE_STATUSES, errorText, firstName, formatTime, isoDate, missingProfileData, plural, type Appointment, type Notice, type RoleProfile } from './format'
import { AppointmentPanel, AppointmentRow, ErrorLine, NoticeList } from './panels'
import { MyAppointments } from './MyAppointments'

export function DoctorDashboard() {
  // Snapshot of "now" per visit; the page reloads its data on each visit anyway.
  const [now] = useState(Date.now)
  const [today, setToday] = useState<Appointment[]>([])
  const [tomorrow, setTomorrow] = useState<Appointment[]>([])
  const [profile, setProfile] = useState<RoleProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: Appointment[] }>(`/api/v1/doctor/appointments?date=${isoDate()}`),
      apiFetch<{ items: Appointment[] }>(`/api/v1/doctor/appointments?date=${isoDate(1)}`),
      apiFetch<RoleProfile>('/api/v1/doctor/me'),
    ])
      .then(([todayData, tomorrowData, profileData]) => {
        setToday(todayData.items)
        setTomorrow(tomorrowData.items)
        setProfile(profileData)
      })
      .catch((err) => setError(errorText(err, 'Falha ao carregar sua agenda.')))
      .finally(() => setLoading(false))
  }, [])

  const todayActive = today.filter((a) => a.status !== 'CANCELLED')
  const nextPatients = today
    .filter((a) => ACTIVE_STATUSES.has(a.status) && new Date(a.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const inProgress = today.find((a) => a.status === 'IN_PROGRESS')
  const unconfirmed = nextPatients.filter((a) => a.status === 'SCHEDULED')
  const tomorrowActive = tomorrow.filter((a) => ACTIVE_STATUSES.has(a.status))
  const missing = missingProfileData(profile)

  const notices: Notice[] = [
    ...(profile?.approval_status === 'PENDING_APPROVAL'
      ? [
          {
            to: '/perfil',
            title: 'Cadastro aguardando aprovação',
            detail: 'A administração ainda está conferindo seu CRM.',
            tone: 'amber' as const,
          },
        ]
      : []),
    ...(inProgress
      ? [
          {
            to: `/doctor/appointments/${inProgress.id}`,
            title: 'Atendimento em andamento',
            detail: `${inProgress.patient?.display_name}, desde ${formatTime(inProgress.starts_at)}. Finalize o prontuário.`,
            tone: 'emerald' as const,
          },
        ]
      : []),
    ...(unconfirmed.length > 0
      ? [
          {
            to: '/doctor/queue',
            count: unconfirmed.length,
            title: plural(unconfirmed.length, 'Consulta de hoje sem confirmação', 'Consultas de hoje sem confirmação'),
            detail: 'A secretaria ainda não confirmou com o paciente.',
            tone: 'amber' as const,
          },
        ]
      : []),
    ...(missing.length > 0
      ? [{ to: '/perfil', title: 'Complete seu cadastro', detail: `Falta informar: ${missing.join(' e ')}.`, tone: 'red' as const }]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title={profile ? `Olá, ${firstName(profile.full_name)}` : 'Bem-vindo de volta'}
        subtitle="Seus pacientes de hoje e o que vem pela frente."
        action={<QueueToggle />}
      />
      <ErrorLine message={error} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarIcon} label="Consultas hoje" value={loading ? '—' : todayActive.length} />
        <StatCard icon={UsersIcon} label="Pacientes restantes hoje" value={loading ? '—' : nextPatients.length} />
        <StatCard icon={ClockIcon} label="Consultas amanhã" value={loading ? '—' : tomorrowActive.length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AppointmentPanel title="Próximos pacientes" to="/doctor/queue" loading={loading} empty="Nenhum paciente restante hoje.">
          {nextPatients.slice(0, 6).map((a) => (
            <AppointmentRow
              key={a.id}
              primary={`${formatTime(a.starts_at)}  ·  ${a.patient?.display_name}`}
              secondary="Hoje"
              status={a.status}
            />
          ))}
        </AppointmentPanel>
        <NoticeList notices={notices} loading={loading} />
      </div>
      <div className="mt-6">
        <MyAppointments />
      </div>
    </div>
  )
}
