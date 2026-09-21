import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'

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
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Aprovação de médicos</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Cadastros de médicos aguardando aprovação para acessar a plataforma.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : doctors.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Nenhum médico pendente.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {doctors.map((doctor) => (
            <li
              key={doctor.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{doctor.full_name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {doctor.specialty} · CRM/{doctor.license_state}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => approve(doctor.id)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(rejecting === doctor.id ? null : doctor.id)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
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
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => reject(doctor.id)}
                    disabled={!reason.trim()}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
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
