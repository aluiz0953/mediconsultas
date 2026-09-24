import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'
import { getCurrentUser, type Role } from '../lib/auth'
import { parseAddress } from '../components/AddressFields'
import { PageHeader } from '../components/PageHeader'
import { QueueToggle, type QueueStatus } from '../components/QueueToggle'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import { ArrowRightIcon, CalendarIcon, CheckCircleIcon, ClockIcon, UsersIcon } from '../components/icons'

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

interface Appointment {
  id: string
  patient?: { display_name: string }
  doctor?: { display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

interface RoleProfile {
  full_name: string
  phone: string | null
  address: string | null
  approval_status?: string
}

interface Notice {
  to: string
  title: string
  detail: string
  tone: 'amber' | 'red' | 'emerald'
  count?: number
}

const NOTICE_TONE = {
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_STATUSES = new Set(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'])

function isoDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDayTime(iso: string): string {
  const date = new Date(iso)
  const day =
    date.toDateString() === new Date().toDateString()
      ? 'Hoje'
      : date.toDateString() === new Date(Date.now() + DAY_MS).toDateString()
        ? 'Amanhã'
        : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return `${day} às ${formatTime(iso)}`
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

// What's missing from the person's own profile, in plain words (empty = complete).
function missingProfileData(profile: RoleProfile | null): string[] {
  if (!profile) return []
  const missing: string[] = []
  if (!profile.phone?.trim()) missing.push('telefone')
  const address = parseAddress(profile.address)
  if (!address.cep || !address.number) missing.push('endereço com CEP e número')
  return missing
}

function firstName(fullName: string | undefined): string {
  // Skips titles so "Dra. Ana Souza" greets as "Ana".
  return fullName?.trim().split(/\s+/).find((word) => !/^dra?\.?$/i.test(word)) ?? ''
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}

function NoticeList({ notices, loading }: { notices: Notice[]; loading: boolean }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-100 px-5 py-4 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
        Avisos
      </h2>
      {loading ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : notices.length === 0 ? (
        <p className="flex items-center gap-2 p-5 text-sm text-neutral-600 dark:text-neutral-300">
          <CheckCircleIcon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Tudo em dia. Nenhuma ação pendente.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {notices.map((notice) => (
            <li key={notice.to + notice.title + notice.detail}>
              <Link
                to={notice.to}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none dark:hover:bg-neutral-800/50 dark:focus-visible:bg-neutral-800/50"
              >
                <span
                  className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums ${NOTICE_TONE[notice.tone]}`}
                >
                  {notice.count ?? <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-neutral-900 dark:text-white">{notice.title}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">{notice.detail}</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AppointmentPanel({
  title,
  to,
  loading,
  empty,
  children,
  scrollable,
}: {
  scrollable?: boolean
  title: string
  to?: string
  loading: boolean
  empty: string
  children: ReactNode[]
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h2>
        {to && (
          <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Ver tudo
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {loading ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : children.length === 0 ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-400">{empty}</p>
      ) : (
        <ul className={`divide-y divide-neutral-100 dark:divide-neutral-800 ${scrollable ? 'max-h-80 overflow-y-auto' : ''}`}>{children}</ul>
      )}
    </section>
  )
}

function AppointmentRow({ primary, secondary, status }: { primary: string; secondary: string; status: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{primary}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{secondary}</p>
      </div>
      <StatusBadge status={status} />
    </li>
  )
}

const PRIMARY_LINK_CLASS =
  'rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2'

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white'

// Staff can be patients too: their own appointments on the home page, or a
// short form to add the patient data the secretary needs to book them.
function MyAppointments() {
  const [state, setState] = useState<'loading' | 'no_profile' | 'ready'>('loading')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [cpf, setCpf] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const { exists } = await apiFetch<{ exists: boolean }>('/api/v1/me/patient-profile')
      if (!exists) {
        setState('no_profile')
        return
      }
      const data = await apiFetch<{ items: Appointment[] }>('/api/v1/me/appointments')
      setAppointments(data.items)
      setState('ready')
    } catch (err) {
      setError(errorText(err, 'Falha ao carregar suas consultas.'))
      setState('no_profile')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/v1/me/patient-profile', {
        method: 'POST',
        body: JSON.stringify({ cpf, birth_date: birthDate, phone }),
      })
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(errorText(err, 'Falha ao salvar seus dados.'))
    } finally {
      setSaving(false)
    }
  }

  if (state === 'ready') {
    const now = Date.now()
    const upcoming = appointments
      .filter((a) => ACTIVE_STATUSES.has(a.status) && new Date(a.ends_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return (
      <AppointmentPanel title="Minhas consultas" loading={false} empty="Nenhuma consulta marcada para você. Peça à secretaria para agendar.">
        {upcoming.slice(0, 5).map((a) => (
          <AppointmentRow key={a.id} primary={formatDayTime(a.starts_at)} secondary={`com ${a.doctor?.display_name}`} status={a.status} />
        ))}
      </AppointmentPanel>
    )
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Minhas consultas</h2>
      {state === 'loading' ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : !formOpen ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-sm text-neutral-600 dark:text-neutral-300">
            Você também pode ser atendido na clínica. Cadastre seus dados de paciente para a secretaria conseguir agendar para você.
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            Cadastrar meus dados de paciente
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="self_cpf" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">CPF</label>
            <input id="self_cpf" required inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label htmlFor="self_birth" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Data de nascimento</label>
            <input id="self_birth" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label htmlFor="self_phone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Telefone</label>
            <input id="self_phone" type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" disabled={saving} className={`${PRIMARY_LINK_CLASS} disabled:opacity-60`}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <ErrorLine message={error} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Home per role
// ---------------------------------------------------------------------------

const DASHBOARD: Record<Role, () => ReactNode> = {
  ADMIN: AdminDashboard,
  SECRETARY: SecretaryDashboard,
  DOCTOR: DoctorDashboard,
  PATIENT: PatientDashboard,
}

export function HomePage() {
  const user = getCurrentUser()
  if (!user) return null
  const Dashboard = DASHBOARD[user.role]
  return <Dashboard />
}

function PatientDashboard() {
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

  const now = Date.now()
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

function DoctorDashboard() {
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

  const now = Date.now()
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

const QUEUE_CHIP: Record<QueueStatus, { label: string; className: string }> = {
  OPEN: { label: 'Fila aberta', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  PAUSED: { label: 'Fila pausada', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  CLOSED: { label: 'Fila fechada', className: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

// Which doctors are seeing patients right now (the doctor's own queue switch).
function DoctorQueues() {
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

function SecretaryDashboard() {
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

  const now = Date.now()
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

function AdminDashboard() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: unknown[] }>('/api/v1/admin/doctors/pending'),
      apiFetch<{ items: { role: Role; status: string }[] }>('/api/v1/admin/accounts'),
      apiFetch<{ items: { created_at: string }[] }>('/api/v1/admin/audit-events?action=auth.login_failed'),
    ])
      .then(([doctors, accounts, failedLogins]) => {
        // Pending doctors already have their own row; don't count them twice.
        const accountIssues = accounts.items.filter(
          (a) => a.status === 'LOCKED' || a.status === 'SUSPENDED' || (a.status === 'PENDING' && a.role !== 'DOCTOR'),
        ).length
        const since = Date.now() - DAY_MS
        const recentFailures = failedLogins.items.filter((e) => new Date(e.created_at).getTime() >= since).length

        const all: Notice[] = [
          {
            to: '/admin/doctors',
            count: doctors.items.length,
            title: plural(doctors.items.length, 'Médico aguardando aprovação', 'Médicos aguardando aprovação'),
            detail: 'Revise o CRM e aprove ou rejeite o cadastro.',
            tone: 'amber',
          },
          {
            to: '/admin/accounts',
            count: accountIssues,
            title: plural(accountIssues, 'Conta precisa de atenção', 'Contas precisam de atenção'),
            detail: 'Contas pendentes, bloqueadas ou suspensas.',
            tone: 'amber',
          },
          {
            to: '/admin/audit?action=auth.login_failed',
            count: recentFailures,
            title: plural(recentFailures, 'Login falhou nas últimas 24h', 'Logins falharam nas últimas 24h'),
            detail: 'Confira na auditoria se há tentativas suspeitas.',
            tone: 'red',
          },
        ]
        setNotices(all.filter((notice) => (notice.count ?? 0) > 0))
      })
      .catch((err) => setError(errorText(err, 'Falha ao carregar as pendências.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Bem-vindo de volta" subtitle="O que precisa da sua atenção no sistema agora." />
      <ErrorLine message={error} />
      <div className="mt-6">
        <NoticeList notices={notices} loading={loading} />
      </div>
      <div className="mt-6">
        <MyAppointments />
      </div>
    </div>
  )
}
