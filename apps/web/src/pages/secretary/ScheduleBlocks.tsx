import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { toDatetimeLocal } from '../../lib/datetime'

interface BlockDoctor {
  id: string
  full_name: string
  specialty: string
}

interface ScheduleBlock {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

// Blocks an interval in one doctor's agenda (holiday, day off, emergency).
export function ScheduleBlocks({ date, doctors }: { date: string; doctors: BlockDoctor[] }) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [blockDoctorId, setBlockDoctorId] = useState('')
  const [blockStartTime, setBlockStartTime] = useState('12:00')
  const [blockEndTime, setBlockEndTime] = useState('13:00')
  const [blockReason, setBlockReason] = useState('')
  const [blockError, setBlockError] = useState('')

  async function loadBlocks(doctorId: string) {
    if (!doctorId) {
      setBlocks([])
      return
    }
    try {
      const data = await apiFetch<{ items: ScheduleBlock[] }>(
        `/api/v1/secretary/schedule-blocks?doctor_id=${doctorId}&date=${date}`,
      )
      setBlocks(data.items)
    } catch (err) {
      setBlockError(err instanceof ApiError ? err.message : 'Falha ao carregar bloqueios.')
    }
  }

  useEffect(() => {
    loadBlocks(blockDoctorId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockDoctorId, date])

  async function handleCreateBlock(event: FormEvent) {
    event.preventDefault()
    setBlockError('')
    if (!blockDoctorId) {
      setBlockError('Selecione um médico.')
      return
    }
    try {
      await apiFetch('/api/v1/secretary/schedule-blocks', {
        method: 'POST',
        body: JSON.stringify({
          doctor_id: blockDoctorId,
          starts_at: new Date(toDatetimeLocal(date, blockStartTime)).toISOString(),
          ends_at: new Date(toDatetimeLocal(date, blockEndTime)).toISOString(),
          reason: blockReason,
        }),
      })
      setBlockReason('')
      await loadBlocks(blockDoctorId)
    } catch (err) {
      setBlockError(err instanceof ApiError ? err.message : 'Falha ao bloquear horário.')
    }
  }

  async function removeBlock(blockId: string) {
    try {
      await apiFetch(`/api/v1/secretary/schedule-blocks/${blockId}`, { method: 'DELETE' })
      await loadBlocks(blockDoctorId)
    } catch (err) {
      setBlockError(err instanceof ApiError ? err.message : 'Falha ao remover bloqueio.')
    }
  }

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Bloqueio de agenda</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Bloqueie um intervalo na agenda de um médico (feriado, folga, emergência) para evitar agendamentos.
      </p>

      <form
        onSubmit={handleCreateBlock}
        className="mt-4 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-2"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Médico</label>
          <select
            value={blockDoctorId}
            onChange={(event) => setBlockDoctorId(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            <option value="">Selecione…</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name} · {doctor.specialty}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Motivo</label>
          <input
            type="text"
            value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)}
            placeholder="Feriado, folga, emergência…"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Início</label>
          <input
            type="time"
            value={blockStartTime}
            onChange={(event) => setBlockStartTime(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Fim</label>
          <input
            type="time"
            value={blockEndTime}
            onChange={(event) => setBlockEndTime(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        {blockError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
            {blockError}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Bloquear horário
          </button>
        </div>
      </form>

      {blockDoctorId && (
        <ul className="mt-4 space-y-2">
          {blocks.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Nenhum bloqueio para este médico nesta data.</p>
          )}
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <p className="text-sm text-neutral-900 dark:text-white">
                  {new Date(block.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(block.ends_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {block.reason && <p className="text-xs text-neutral-400 dark:text-neutral-500">{block.reason}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeBlock(block.id)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
