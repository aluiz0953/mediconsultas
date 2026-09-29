import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { ACTIVE_STATUSES, errorText, formatDayTime, type Appointment } from './format'
import { AppointmentPanel, AppointmentRow, ErrorLine, PRIMARY_LINK_CLASS } from './panels'

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white'

// Staff can be patients too: their own appointments on the home page, or a
// short form to add the patient data the secretary needs to book them.
export function MyAppointments() {
  // Snapshot of "now" per visit; the page reloads its data on each visit anyway.
  const [now] = useState(Date.now)
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
    queueMicrotask(load)
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
