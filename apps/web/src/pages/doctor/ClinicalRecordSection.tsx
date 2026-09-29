import { useEffect, useState } from 'react'
import { apiFetch, ApiError, openPdf } from '../../lib/api'
import { errorMessage } from '../../lib/errorMessage'

interface ClinicalRecordContent {
  chief_complaint: string
  assessment: string
  instructions: string
  conduct: string
  medications: string
  recommended_exams: string
  notes: string
}

interface ClinicalRecord {
  id: string
  version: number
  status: 'DRAFT' | 'FINALIZED' | 'AMENDED' | 'ARCHIVED'
  content: Partial<ClinicalRecordContent>
}

const EMPTY_CONTENT: ClinicalRecordContent = {
  chief_complaint: '',
  assessment: '',
  instructions: '',
  conduct: '',
  medications: '',
  recommended_exams: '',
  notes: '',
}

const CONTENT_FIELDS: Array<{ key: keyof ClinicalRecordContent; label: string; required?: boolean }> = [
  { key: 'chief_complaint', label: 'Queixa principal' },
  { key: 'assessment', label: 'Avaliação clínica', required: true },
  { key: 'instructions', label: 'Orientações ao paciente', required: true },
  { key: 'conduct', label: 'Conduta' },
  { key: 'medications', label: 'Medicações em uso' },
  { key: 'recommended_exams', label: 'Exames recomendados' },
  { key: 'notes', label: 'Notas' },
]

export function ClinicalRecordSection({ appointmentId }: { appointmentId: string | undefined }) {
  const [record, setRecord] = useState<ClinicalRecord | null>(null)
  const [content, setContent] = useState<ClinicalRecordContent>(EMPTY_CONTENT)
  const [releaseToPatient, setReleaseToPatient] = useState(false)
  const [recordError, setRecordError] = useState('')

  useEffect(() => {
    apiFetch<ClinicalRecord>(`/api/v1/doctor/appointments/${appointmentId}/clinical-record`)
      .then((data) => {
        setRecord(data)
        setContent({ ...EMPTY_CONTENT, ...data.content })
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 404)) setRecordError(errorMessage(err, 'Falha ao carregar registro clínico.'))
      })
  }, [appointmentId])

  async function openRecord() {
    setRecordError('')
    try {
      const created = await apiFetch<{ id: string; version: number; status: ClinicalRecord['status'] }>(
        `/api/v1/doctor/appointments/${appointmentId}/clinical-records`,
        { method: 'POST', body: JSON.stringify(content) },
      )
      setRecord({ ...created, content })
    } catch (err) {
      setRecordError(errorMessage(err, 'Falha ao abrir registro clínico.'))
    }
  }

  async function saveRecordDraft() {
    if (!record) return
    setRecordError('')
    try {
      const updated = await apiFetch<{ id: string; version: number; status: ClinicalRecord['status'] }>(
        `/api/v1/doctor/clinical-records/${record.id}`,
        { method: 'PATCH', body: JSON.stringify(content) },
      )
      setRecord({ ...updated, content })
    } catch (err) {
      setRecordError(errorMessage(err, 'Falha ao salvar rascunho.'))
    }
  }

  async function finalizeRecord() {
    if (!record) return
    setRecordError('')
    try {
      const updated = await apiFetch<{ id: string; version: number; status: ClinicalRecord['status'] }>(
        `/api/v1/doctor/clinical-records/${record.id}/finalize`,
        { method: 'POST', body: JSON.stringify({ release_to_patient: releaseToPatient }) },
      )
      setRecord({ ...updated, content })
    } catch (err) {
      setRecordError(errorMessage(err, 'Falha ao finalizar registro clínico.'))
    }
  }

  const recordEditable = !record || record.status === 'DRAFT'

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Registro clínico</h2>
        {record && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{record.status === 'DRAFT' ? 'Rascunho' : 'Finalizado'}</span>
            {record.status === 'FINALIZED' && (
              <button
                type="button"
                onClick={() => openPdf(`/api/v1/doctor/clinical-records/${record.id}/pdf`)}
                className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Baixar PDF
              </button>
            )}
          </div>
        )}
      </div>

      {recordError && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {recordError}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {CONTENT_FIELDS.map((field) => (
          <div key={field.key} className={field.key === 'assessment' || field.key === 'instructions' ? 'sm:col-span-2' : ''}>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {field.label}
              {field.required && ' *'}
            </label>
            <textarea
              value={content[field.key]}
              disabled={!recordEditable}
              onChange={(event) => setContent((current) => ({ ...current, [field.key]: event.target.value }))}
              rows={field.key === 'assessment' || field.key === 'instructions' ? 3 : 2}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:disabled:bg-neutral-800/50"
            />
          </div>
        ))}
      </div>

      {recordEditable && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!record ? (
            <button
              type="button"
              onClick={openRecord}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Abrir registro
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={saveRecordDraft}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Salvar rascunho
              </button>
              <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                <input type="checkbox" checked={releaseToPatient} onChange={(event) => setReleaseToPatient(event.target.checked)} />
                Liberar ao paciente
              </label>
              <button
                type="button"
                onClick={finalizeRecord}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Finalizar registro
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
