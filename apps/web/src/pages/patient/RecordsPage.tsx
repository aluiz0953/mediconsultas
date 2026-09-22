import { useEffect, useState } from 'react'
import { apiFetch, ApiError, openPdf } from '../../lib/api'

interface ClinicalRecordSummary {
  id: string
  version: number
  doctor: { id: string; display_name: string } | null
  finalized_at: string | null
  released_at: string | null
}

interface ClinicalRecordDetail extends ClinicalRecordSummary {
  content: {
    chief_complaint?: string
    assessment?: string
    instructions?: string
    conduct?: string
    medications?: string
    recommended_exams?: string
    notes?: string
  }
}

interface PrescriptionItem {
  medication_name: string
  strength: string | null
  presentation: string | null
  dosage: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  instructions: string | null
}

interface PrescriptionSummary {
  id: string
  version: number
  doctor: { id: string; display_name: string } | null
  issued_at: string | null
  no_medication_needed: boolean
}

interface PrescriptionDetail extends PrescriptionSummary {
  items: PrescriptionItem[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const NEW_BADGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

function isRecent(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < NEW_BADGE_WINDOW_MS
}

function NewBadge() {
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
      Novo
    </span>
  )
}

type Tab = 'orientacoes' | 'receitas'

export function RecordsPage() {
  const [tab, setTab] = useState<Tab>('orientacoes')
  const [records, setRecords] = useState<ClinicalRecordDetail[] | null>(null)
  const [prescriptions, setPrescriptions] = useState<PrescriptionDetail[] | null>(null)
  const [error, setError] = useState('')

  const newRecordsCount = records?.filter((record) => isRecent(record.released_at)).length ?? 0
  const newPrescriptionsCount = prescriptions?.filter((prescription) => isRecent(prescription.issued_at)).length ?? 0

  useEffect(() => {
    async function loadRecords() {
      const list = await apiFetch<{ items: ClinicalRecordSummary[] }>('/api/v1/patient/clinical-records')
      const details = await Promise.all(
        list.items.map((item) => apiFetch<ClinicalRecordDetail>(`/api/v1/patient/clinical-records/${item.id}`)),
      )
      setRecords(details)
    }

    async function loadPrescriptions() {
      const list = await apiFetch<{ items: PrescriptionSummary[] }>('/api/v1/patient/prescriptions')
      const details = await Promise.all(
        list.items.map((item) => apiFetch<PrescriptionDetail>(`/api/v1/patient/prescriptions/${item.id}`)),
      )
      setPrescriptions(details)
    }

    Promise.all([loadRecords(), loadPrescriptions()]).catch((err) =>
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar seus documentos.'),
    )
  }, [])

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Meus documentos</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Só aparecem aqui orientações e receitas já finalizadas e liberadas pelo médico.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2 border-b border-slate-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setTab('orientacoes')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${
            tab === 'orientacoes'
              ? 'border-b-2 border-emerald-600 text-slate-900 dark:text-white'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Orientações
          {newRecordsCount > 0 && <NewBadge />}
        </button>
        <button
          type="button"
          onClick={() => setTab('receitas')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${
            tab === 'receitas'
              ? 'border-b-2 border-emerald-600 text-slate-900 dark:text-white'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Receitas
          {newPrescriptionsCount > 0 && <NewBadge />}
        </button>
      </div>

      {tab === 'orientacoes' ? (
        <ul className="mt-6 space-y-4">
          {records === null && !error && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}
          {records?.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma orientação liberada ainda.</p>}
          {records?.map((record) => (
            <li key={record.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                  {record.doctor?.display_name ?? 'Médico'}
                  {isRecent(record.released_at) && <NewBadge />}
                </p>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Liberado em {formatDate(record.released_at)}</p>
                  <button
                    type="button"
                    onClick={() => openPdf(`/api/v1/patient/clinical-records/${record.id}/pdf`)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
                  >
                    Baixar PDF
                  </button>
                </div>
              </div>
              <dl className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                {record.content.assessment && (
                  <div>
                    <dt className="font-medium">Avaliação</dt>
                    <dd className="whitespace-pre-wrap">{record.content.assessment}</dd>
                  </div>
                )}
                {record.content.instructions && (
                  <div>
                    <dt className="font-medium">Orientações</dt>
                    <dd className="whitespace-pre-wrap">{record.content.instructions}</dd>
                  </div>
                )}
                {record.content.conduct && (
                  <div>
                    <dt className="font-medium">Conduta</dt>
                    <dd className="whitespace-pre-wrap">{record.content.conduct}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-6 space-y-4">
          {prescriptions === null && !error && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}
          {prescriptions?.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma receita finalizada ainda.</p>}
          {prescriptions?.map((prescription) => (
            <li key={prescription.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                  {prescription.doctor?.display_name ?? 'Médico'}
                  {isRecent(prescription.issued_at) && <NewBadge />}
                </p>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Emitida em {formatDate(prescription.issued_at)}</p>
                  <button
                    type="button"
                    onClick={() => openPdf(`/api/v1/patient/prescriptions/${prescription.id}/pdf`)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
                  >
                    Baixar PDF
                  </button>
                </div>
              </div>
              {prescription.no_medication_needed ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nenhuma medicação necessária.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  {prescription.items.map((item, index) => (
                    <li key={index}>
                      <span className="font-medium">{item.medication_name}</span>
                      {item.dosage ? ` — ${item.dosage}` : ''}
                      {item.frequency ? `, ${item.frequency}` : ''}
                      {item.duration ? `, ${item.duration}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
