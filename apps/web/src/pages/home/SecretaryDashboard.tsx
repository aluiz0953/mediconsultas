import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { CalendarIcon, CheckCircleIcon, ClockIcon } from '../../components/icons'
import { ACTIVE_STATUSES, errorText, formatTime, isoDate, plural, type Appointment, type Notice } from './format'
import { AppointmentPanel, AppointmentRow, ErrorLine, NoticeList, PRIMARY_LINK_CLASS } from './panels'
import { DoctorQueues } from './DoctorQueues'
import { MyAppointments } from './MyAppointments'

export function SecretaryDashboard() {
  // Snapshot of "now" per visit; the page reloads its data on each visit anyway.
  const [now] = useState(Date.now)
  const [today, setToday] = useState<Appointment[]>([])
  const [tomorrow, setTomorrow] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: Appointment[] }>(`/api/v1/secretary/appointments?date=${isoDate()}`),
      apiFetch<{ items: Appointment[] }>(`/api/v1/secretary/appointments?date=${isoDate(1)}`),
    ])
      .then(([todayData, tomorrowData]) => {
        setToday(todayData.items)
        setTomorrow(tomorrowData.items)
      })
      .catch((err) => setError(errorText(err, 'Falha ao carregar a agenda.')))
      .finally(() => setLoading(false))
  }, [])

  const todayActive = today.filter((a) => a.status !== 'CANCELLED')
  const upcomingToday = today
    .filter((a) => ACTIVE_STATUSES.has(a.status) && new Date(a.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const waitingToday = upcomingToday.filter((a) => a.status === 'SCHEDULED')
  const confirmed = today.filter((a) => a.status === 'CONFIRMED').length
  const waitingTomorrow = tomorrow.filter((a) => a.status === 'SCHEDULED')

  const notices: Notice[] = [
    ...(waitingToday.length > 0
      ? [
          {
            to: '/secretary/schedule',
            count: waitingToday.length,
            title: plural(waitingToday.length, 'Consulta de hoje para confirmar', 'Consultas de hoje para confirmar'),
            detail: `A próxima é às ${formatTime(waitingToday[0].starts_at)}, com ${waitingToday[0].patient?.display_name}.`,
            tone: 'red' as const,
          },
        ]
      : []),
    ...(waitingTomorrow.length > 0
      ? [
          {
            to: `/secretary/schedule?date=${isoDate(1)}`,
            count: waitingTomorrow.length,
            title: plural(waitingTomorrow.length, 'Consulta de amanhã para confirmar', 'Consultas de amanhã para confirmar'),
            detail: 'Entre em contato com os pacientes e confirme os horários.',
            tone: 'amber' as const,
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Visão geral da agenda"
        subtitle="Acompanhe as consultas de hoje e o que precisa de atenção."
        action={
          <Link to="/secretary/schedule" className={PRIMARY_LINK_CLASS}>
            Ir para a agenda
          </Link>
        }
      />
      <ErrorLine message={error} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarIcon} label="Consultas hoje" value={loading ? '—' : todayActive.length} />
        <StatCard icon={ClockIcon} label="Aguardando confirmação" value={loading ? '—' : waitingToday.length} />
        <StatCard icon={CheckCircleIcon} label="Confirmadas" value={loading ? '—' : confirmed} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AppointmentPanel
          title="Próximas consultas de hoje"
          to="/secretary/schedule"
          loading={loading}
          empty="Nenhuma consulta restante hoje."
        >
          {upcomingToday.slice(0, 6).map((a) => (
            <AppointmentRow
              key={a.id}
              primary={`${formatTime(a.starts_at)}  ·  ${a.patient?.display_name}`}
              secondary={`com ${a.doctor?.display_name}`}
              status={a.status}
            />
          ))}
        </AppointmentPanel>
        <NoticeList notices={notices} loading={loading} />
      </div>
      <div className="mt-6">
        <DoctorQueues />
      </div>
      <div className="mt-6">
        <MyAppointments />
      </div>
    </div>
  )
}
