import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api'

export type QueueStatus = 'CLOSED' | 'OPEN' | 'PAUSED'

// Closed → open (green) → paused (red) → open again. The queue starts closed each day.
const NEXT: Record<QueueStatus, QueueStatus> = { CLOSED: 'OPEN', OPEN: 'PAUSED', PAUSED: 'OPEN' }

const LOOK: Record<QueueStatus, { label: string; hint: string; className: string }> = {
  CLOSED: {
    label: 'Abrir fila',
    hint: 'Abrir a fila de atendimento',
    className:
      'border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50 dark:bg-neutral-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40',
  },
  OPEN: {
    label: 'Fila aberta',
    hint: 'Fila aberta. Toque para pausar.',
    className: 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
  },
  PAUSED: {
    label: 'Fila pausada',
    hint: 'Fila pausada. Toque para retomar.',
    className: 'border border-red-600 bg-red-600 text-white hover:bg-red-700',
  },
}

export function QueueToggle({ onChange }: { onChange?: (status: QueueStatus) => void }) {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<{ status: QueueStatus }>('/api/v1/doctor/queue-status')
      .then((data) => {
        setStatus(data.status)
        onChange?.(data.status)
      })
      .catch(() => setStatus('CLOSED'))
  }, [onChange])

  async function toggle() {
    if (!status) return
    const next = NEXT[status]
    setBusy(true)
    setError('')
    try {
      await apiFetch('/api/v1/doctor/queue-status', { method: 'PUT', body: JSON.stringify({ status: next }) })
      setStatus(next)
      onChange?.(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao mudar a fila.')
    } finally {
      setBusy(false)
    }
  }

  const look = LOOK[status ?? 'CLOSED']
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={!status || busy}
        aria-label={look.hint}
        title={look.hint}
        className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60 ${look.className}`}
      >
        {status === 'OPEN' && <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />}
        {status === 'PAUSED' && (
          <span className="flex gap-0.5" aria-hidden="true">
            <span className="h-2.5 w-1 rounded-sm bg-white" />
            <span className="h-2.5 w-1 rounded-sm bg-white" />
          </span>
        )}
        {look.label}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
