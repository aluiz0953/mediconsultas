import { useEffect, useState } from 'react'
import { apiFetch, ApiError, openPdf } from '../../lib/api'
import { errorMessage } from '../../lib/errorMessage'

interface PrescriptionItem {
  medication_name: string
  strength: string
  presentation: string
  dosage: string
  frequency: string
  duration: string
  quantity: string
  instructions: string
}

interface Prescription {
  id: string
  version: number
  status: 'DRAFT' | 'FINALIZED' | 'SUPERSEDED' | 'CANCELLED'
  no_medication_needed: boolean
  items: PrescriptionItem[]
}

const EMPTY_ITEM: PrescriptionItem = {
  medication_name: '',
  strength: '',
  presentation: '',
  dosage: '',
  frequency: '',
  duration: '',
  quantity: '',
  instructions: '',
}

export function PrescriptionSection({ appointmentId }: { appointmentId: string | undefined }) {
  const [prescription, setPrescription] = useState<Prescription | null>(null)
  const [items, setItems] = useState<PrescriptionItem[]>([{ ...EMPTY_ITEM }])
  const [noMedicationNeeded, setNoMedicationNeeded] = useState(false)
  const [prescriptionError, setPrescriptionError] = useState('')

  useEffect(() => {
    apiFetch<Prescription>(`/api/v1/doctor/appointments/${appointmentId}/prescription`)
      .then((data) => {
        setPrescription(data)
        setNoMedicationNeeded(data.no_medication_needed)
        if (data.items.length > 0) setItems(data.items)
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 404)) setPrescriptionError(errorMessage(err, 'Falha ao carregar receita.'))
      })
  }, [appointmentId])

  function updateItem(index: number, field: keyof PrescriptionItem, value: string) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  function addItem() {
    setItems((current) => [...current, { ...EMPTY_ITEM }])
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  function validItems() {
    return items.filter((item) => item.medication_name.trim()).map((item) => ({ ...item }))
  }

  async function openPrescription() {
    setPrescriptionError('')
    try {
      const created = await apiFetch<{ id: string; version: number; status: Prescription['status'] }>(
        `/api/v1/doctor/appointments/${appointmentId}/prescriptions`,
        {
          method: 'POST',
          body: JSON.stringify({
            items: validItems().map((i) => ({ medication_name: i.medication_name, strength: i.strength, presentation: i.presentation, dosage: i.dosage, frequency: i.frequency, duration: i.duration, quantity: i.quantity, instructions: i.instructions })),
            no_medication_needed: noMedicationNeeded,
          }),
        },
      )
      setPrescription({ ...created, no_medication_needed: noMedicationNeeded, items: validItems() })
    } catch (err) {
      setPrescriptionError(errorMessage(err, 'Falha ao abrir receita.'))
    }
  }

  async function savePrescriptionDraft() {
    if (!prescription) return
    setPrescriptionError('')
    try {
      const updated = await apiFetch<{ id: string; version: number; status: Prescription['status'] }>(
        `/api/v1/doctor/prescriptions/${prescription.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            items: validItems().map((i) => ({ medication_name: i.medication_name, strength: i.strength, presentation: i.presentation, dosage: i.dosage, frequency: i.frequency, duration: i.duration, quantity: i.quantity, instructions: i.instructions })),
            no_medication_needed: noMedicationNeeded,
          }),
        },
      )
      setPrescription({ ...updated, no_medication_needed: noMedicationNeeded, items: validItems() })
    } catch (err) {
      setPrescriptionError(errorMessage(err, 'Falha ao salvar rascunho da receita.'))
    }
  }

  async function finalizePrescription() {
    if (!prescription) return
    setPrescriptionError('')
    try {
      const updated = await apiFetch<{ id: string; version: number; status: Prescription['status'] }>(
        `/api/v1/doctor/prescriptions/${prescription.id}/finalize`,
        { method: 'POST' },
      )
      setPrescription({ ...prescription, ...updated })
    } catch (err) {
      setPrescriptionError(errorMessage(err, 'Falha ao finalizar receita.'))
    }
  }

  const prescriptionEditable = !prescription || prescription.status === 'DRAFT'

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Receita médica</h2>
        {prescription && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{prescription.status === 'DRAFT' ? 'Rascunho' : 'Finalizada'}</span>
            {prescription.status === 'FINALIZED' && (
              <button
                type="button"
                onClick={() => openPdf(`/api/v1/doctor/prescriptions/${prescription.id}/pdf`)}
                className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Baixar PDF
              </button>
            )}
          </div>
        )}
      </div>

      {prescriptionError && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {prescriptionError}
        </p>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={noMedicationNeeded}
          disabled={!prescriptionEditable}
          onChange={(event) => setNoMedicationNeeded(event.target.checked)}
        />
        Não é necessária medicação
      </label>

      {!noMedicationNeeded && (
        <div className="mt-3 space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-700 sm:grid-cols-4">
              <input
                placeholder="Medicamento *"
                value={item.medication_name}
                disabled={!prescriptionEditable}
                onChange={(event) => updateItem(index, 'medication_name', event.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white sm:col-span-2"
              />
              <input
                placeholder="Dosagem"
                value={item.dosage}
                disabled={!prescriptionEditable}
                onChange={(event) => updateItem(index, 'dosage', event.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <input
                placeholder="Frequência"
                value={item.frequency}
                disabled={!prescriptionEditable}
                onChange={(event) => updateItem(index, 'frequency', event.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <input
                placeholder="Duração"
                value={item.duration}
                disabled={!prescriptionEditable}
                onChange={(event) => updateItem(index, 'duration', event.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <input
                placeholder="Instruções"
                value={item.instructions}
                disabled={!prescriptionEditable}
                onChange={(event) => updateItem(index, 'instructions', event.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white sm:col-span-3"
              />
              {prescriptionEditable && items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="justify-self-start rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Remover item
                </button>
              )}
            </div>
          ))}
          {prescriptionEditable && (
            <button
              type="button"
              onClick={addItem}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              + Adicionar item
            </button>
          )}
        </div>
      )}

      {prescriptionEditable && (
        <div className="mt-4 flex gap-3">
          {!prescription ? (
            <button
              type="button"
              onClick={openPrescription}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Abrir receita
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={savePrescriptionDraft}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Salvar rascunho
              </button>
              <button
                type="button"
                onClick={finalizePrescription}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Finalizar receita
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
