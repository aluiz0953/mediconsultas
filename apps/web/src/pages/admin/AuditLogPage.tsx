import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch, downloadFile, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

// The complete, real vocabulary of audit_events.action values recorded across
// the API — kept in sync manually since there's no single source of truth
// endpoint for it yet.
const KNOWN_ACTIONS = [
  'account.email_changed',
  'account.invited',
  'account.password_changed',
  'account.profile_updated',
  'account.removed',
  'account.role_changed',
  'account.status_changed',
  'audit_log.exported',
  'auth.login_failed',
  'auth.login_succeeded',
  'auth.password_reset_completed',
  'auth.password_reset_requested',
  'clinical_record.created',
  'clinical_record.finalized',
  'clinical_record.updated',
  'doctor.approved',
  'doctor.rejected',
  'prescription.created',
  'prescription.finalized',
  'prescription.updated',
]

interface AuditEvent {
  id: string
  actor_user_id: string | null
  actor_role: string | null
  action: string
  resource_type: string
  resource_id: string | null
  patient_id: string | null
  result: 'SUCCESS' | 'DENIED' | 'FAILURE'
  reason: string | null
  platform: 'web' | 'android' | null
  created_at: string
}

const PLATFORM_LABEL = { web: 'Web', android: 'App Android' } as const

const RESULT_TONE: Record<AuditEvent['result'], string> = {
  SUCCESS: 'text-emerald-600 dark:text-emerald-400',
  DENIED: 'text-amber-600 dark:text-amber-400',
  FAILURE: 'text-red-600 dark:text-red-400',
}

export function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Deep links (e.g. from the admin home) can pre-select an action filter.
  const [searchParams] = useSearchParams()
  const [action, setAction] = useState(searchParams.get('action') ?? '')
  const [resourceType, setResourceType] = useState('')
  const [search, setSearch] = useState('')
  const [exportReason, setExportReason] = useState('')
  const [exporting, setExporting] = useState(false)

  async function load(filters: { action?: string; resource_type?: string } = {}) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filters.action) params.set('action', filters.action)
      if (filters.resource_type) params.set('resource_type', filters.resource_type)
      const query = params.toString()
      const data = await apiFetch<{ items: AuditEvent[] }>(`/api/v1/admin/audit-events${query ? `?${query}` : ''}`)
      setEvents(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar o log de auditoria.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load({ action: action || undefined })
  }, [])

  function handleFilter(event: FormEvent) {
    event.preventDefault()
    load({ action: action || undefined, resource_type: resourceType.trim() || undefined })
  }

  const visibleEvents = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) =>
      [event.action, event.resource_type, event.actor_role, event.reason]
        .some((field) => field?.toLowerCase().includes(needle)),
    )
  }, [events, search])

  async function handleExport(event: FormEvent) {
    event.preventDefault()
    if (!exportReason.trim()) return
    setExporting(true)
    setError('')
    try {
      const params = new URLSearchParams({ reason: exportReason.trim() })
      if (action.trim()) params.set('action', action.trim())
      if (resourceType.trim()) params.set('resource_type', resourceType.trim())
      await downloadFile(`/api/v1/admin/audit-events/export?${params.toString()}`, `audit-log-${Date.now()}.csv`)
      setExportReason('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao exportar o log de auditoria.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Auditoria"
        subtitle="Ações sensíveis do sistema: aprovação/rejeição de médicos, criação e finalização de prontuários e receitas."
      />

      <form onSubmit={handleFilter} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Ação</label>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            <option value="">Todas as ações</option>
            {KNOWN_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Tipo de recurso</label>
          <input
            type="text"
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            placeholder="ex: clinical_record"
            className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Filtrar
        </button>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Buscar na página atual</label>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ação, recurso, ator ou motivo"
            className="mt-1 w-56 rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </form>

      <form onSubmit={handleExport} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Motivo da exportação (ADM-08)
          </label>
          <input
            type="text"
            value={exportReason}
            onChange={(event) => setExportReason(event.target.value)}
            placeholder="ex: Relatório de conformidade mensal"
            className="mt-1 w-72 rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={!exportReason.trim() || exporting}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : visibleEvents.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Nenhum evento encontrado.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2">Quando</th>
                <th className="px-4 py-2">Ação</th>
                <th className="px-4 py-2">Recurso</th>
                <th className="px-4 py-2">Ator</th>
                <th className="px-4 py-2">Resultado</th>
                <th className="px-4 py-2">Plataforma</th>
                <th className="px-4 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
              {visibleEvents.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-neutral-500 dark:text-neutral-400">
                    {new Date(event.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2 font-medium text-neutral-900 dark:text-white">{event.action}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                    {event.resource_type}
                    {event.resource_id ? ` · ${event.resource_id.slice(0, 8)}…` : ''}
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">
                    {event.actor_role ?? '—'}
                    {event.actor_user_id ? ` · ${event.actor_user_id.slice(0, 8)}…` : ''}
                  </td>
                  <td className={`px-4 py-2 font-medium ${RESULT_TONE[event.result]}`}>{event.result}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-neutral-500 dark:text-neutral-400">
                    {event.platform ? PLATFORM_LABEL[event.platform] : '—'}
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{event.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
