import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

interface PendingDoctor {
  id: string
  full_name: string
  license_state: string
  specialty: string
  created_at: string
}

export function PendingDoctorsPage() {
  const [doctors, setDoctors] = useState<PendingDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ items: PendingDoctor[] }>('/api/v1/admin/doctors/pending')
      setDoctors(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar médicos pendentes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function approve(id: string) {
    try {
      await apiFetch(`/api/v1/admin/doctors/${id}/approve`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao aprovar médico.')
    }
  }

  async function reject(id: string) {
    if (!reason.trim()) return
    try {
      await apiFetch(`/api/v1/admin/doctors/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setRejecting(null)
      setReason('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao rejeitar médico.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Aprovação de médicos"
        subtitle="Cadastros de médicos aguardando aprovação para acessar a plataforma."
      />

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : doctors.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Nenhum médico pendente.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {doctors.map((doctor) => (
            <li
              key={doctor.id}
              className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">{doctor.full_name}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {doctor.specialty} · CRM/{doctor.license_state}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => approve(doctor.id)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(rejecting === doctor.id ? null : doctor.id)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>

              {rejecting === doctor.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Justificativa da rejeição"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => reject(doctor.id)}
                    disabled={!reason.trim()}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Confirmar rejeição
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
