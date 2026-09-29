import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { ACTIVE_STATUSES, DAY_MS, errorText, firstName, formatDayTime, missingProfileData, plural, type Appointment, type Notice, type RoleProfile } from './format'
import { AppointmentPanel, AppointmentRow, ErrorLine, NoticeList } from './panels'

export function PatientDashboard() {
  // Snapshot of "now" per visit; the page reloads its data on each visit anyway.
  const [now] = useState(Date.now)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [profile, setProfile] = useState<RoleProfile | null>(null)
  const [newDocuments, setNewDocuments] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const weekAgo = Date.now() - 7 * DAY_MS
    const recent = (iso: string | null) => (iso ? new Date(iso).getTime() >= weekAgo : false)
    Promise.all([
      apiFetch<{ items: Appointment[] }>('/api/v1/patient/appointments'),
      apiFetch<RoleProfile>('/api/v1/patient/me'),
      apiFetch<{ items: { released_at: string | null }[] }>('/api/v1/patient/clinical-records'),
      apiFetch<{ items: { issued_at: string | null }[] }>('/api/v1/patient/prescriptions'),
    ])
      .then(([appointmentData, profileData, records, prescriptions]) => {
        setAppointments(appointmentData.items)
        setProfile(profileData)
        setNewDocuments(
          records.items.filter((r) => recent(r.released_at)).length +
            prescriptions.items.filter((p) => recent(p.issued_at)).length,
        )
      })
      .catch((err) => setError(errorText(err, 'Falha ao carregar seu resumo.')))
      .finally(() => setLoading(false))
  }, [])

  const upcoming = appointments
    .filter((a) => ACTIVE_STATUSES.has(a.status) && new Date(a.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const next = upcoming[0]
  const awaiting = upcoming.filter((a) => a.status === 'SCHEDULED')
  const confirmedSoon = upcoming.filter(
    (a) => a.status === 'CONFIRMED' && new Date(a.starts_at).getTime() - now < 7 * DAY_MS,
  )
  const missing = missingProfileData(profile)

  const notices: Notice[] = [
    ...confirmedSoon.slice(0, 3).map((a) => ({
      to: '/patient/appointments',
      title: 'Consulta confirmada',
      detail: `${formatDayTime(a.starts_at)}, com ${a.doctor?.display_name ?? 'seu médico'}.`,
      tone: 'emerald' as const,
    })),
    ...(awaiting.length > 0
      ? [
          {
            to: '/patient/appointments',
            count: awaiting.length,
            title: plural(awaiting.length, 'Consulta aguardando confirmação', 'Consultas aguardando confirmação'),
            detail: 'A clínica ainda vai confirmar o horário. O aviso aparece aqui quando confirmar.',
            tone: 'amber' as const,
          },
        ]
      : []),
    ...(missing.length > 0
      ? [{ to: '/perfil', title: 'Complete seu cadastro', detail: `Falta informar: ${missing.join(' e ')}.`, tone: 'red' as const }]
      : []),
    ...(newDocuments > 0
      ? [
          {
            to: '/patient/records',
            count: newDocuments,
            title: plural(newDocuments, 'Novo documento disponível', 'Novos documentos disponíveis'),
            detail: 'Orientações ou receitas liberadas pelo médico nos últimos 7 dias.',
            tone: 'emerald' as const,
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title={profile ? `Olá, ${firstName(profile.full_name)}` : 'Bem-vindo de volta'}
        subtitle="Suas próximas consultas e o que precisa da sua atenção."
      />
      <ErrorLine message={error} />

      <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <h2 className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Próxima consulta</h2>
        {loading ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
        ) : next ? (
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xl font-semibold text-neutral-900 dark:text-white">{formatDayTime(next.starts_at)}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">com {next.doctor?.display_name}</p>
            </div>
            <StatusBadge status={next.status} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Você não tem consultas marcadas. Fale com a clínica para agendar.
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <NoticeList notices={notices} loading={loading} />
        <AppointmentPanel title="Próximas consultas" to="/patient/appointments" loading={loading} empty="Nenhuma consulta futura.">
          {upcoming.slice(0, 5).map((a) => (
            <AppointmentRow
              key={a.id}
              primary={formatDayTime(a.starts_at)}
              secondary={`com ${a.doctor?.display_name}`}
              status={a.status}
            />
          ))}
        </AppointmentPanel>
      </div>
    </div>
  )
}
