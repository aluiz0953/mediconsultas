import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'

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
  created_at: string
}

const RESULT_TONE: Record<AuditEvent['result'], string> = {
  SUCCESS: 'text-emerald-600 dark:text-emerald-400',
  DENIED: 'text-amber-600 dark:text-amber-400',
  FAILURE: 'text-red-600 dark:text-red-400',
}

export function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')

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
    load()
  }, [])

  function handleFilter(event: FormEvent) {
    event.preventDefault()
    load({ action: action.trim() || undefined, resource_type: resourceType.trim() || undefined })
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Auditoria</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Ações sensíveis do sistema: aprovação/rejeição de médicos, criação e finalização de prontuários e receitas.
      </p>

      <form onSubmit={handleFilter} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ação</label>
          <input
            type="text"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="ex: doctor.approved"
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de recurso</label>
          <input
            type="text"
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            placeholder="ex: clinical_record"
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
        >
          Filtrar
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Nenhum evento encontrado.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-gray-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Quando</th>
                <th className="px-4 py-2">Ação</th>
                <th className="px-4 py-2">Recurso</th>
                <th className="px-4 py-2">Ator</th>
                <th className="px-4 py-2">Resultado</th>
                <th className="px-4 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500 dark:text-slate-400">
                    {new Date(event.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{event.action}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                    {event.resource_type}
                    {event.resource_id ? ` · ${event.resource_id.slice(0, 8)}…` : ''}
                  </td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                    {event.actor_role ?? '—'}
                    {event.actor_user_id ? ` · ${event.actor_user_id.slice(0, 8)}…` : ''}
                  </td>
                  <td className={`px-4 py-2 font-medium ${RESULT_TONE[event.result]}`}>{event.result}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{event.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
