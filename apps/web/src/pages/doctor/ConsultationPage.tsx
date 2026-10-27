import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { ClinicalRecordSection } from './ClinicalRecordSection'
import { PrescriptionSection } from './PrescriptionSection'

export function ConsultationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>()

  return (
    <div className="space-y-8">
      <PageHeader title="Atendimento em andamento" subtitle="Registro clínico e receita desta consulta." />
      <ClinicalRecordSection appointmentId={appointmentId} />
      <PrescriptionSection appointmentId={appointmentId} />
      <CompleteConsultationSection appointmentId={appointmentId} />
    </div>
  )
}

// DOC-07: closing needs a finalized record; without one, the doctor states why.
function CompleteConsultationSection({ appointmentId }: { appointmentId?: string }) {
  const navigate = useNavigate()
  const [noRecordReason, setNoRecordReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function complete() {
    setSubmitting(true)
    setError('')
    try {
      await apiFetch(`/api/v1/doctor/appointments/${appointmentId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ no_record_reason: noRecordReason }),
      })
      navigate('/doctor/queue', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao concluir o atendimento.')
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium text-neutral-900 dark:text-white">Concluir atendimento</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Depois de concluída, a consulta não aceita mais alterações no registro clínico nem na receita.
      </p>
      <label className="mt-3 block text-sm text-neutral-700 dark:text-neutral-300">
        Justificativa, só se não houver registro clínico
        <textarea
          value={noRecordReason}
          onChange={(event) => setNoRecordReason(event.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={submitting}
        onClick={complete}
        className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Concluir atendimento
      </button>
    </section>
  )
}
