import { useSearchParams } from 'react-router-dom'
import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError, apiUrl } from '../../lib/api'
import { getToken } from '../../lib/auth'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { APPOINTMENT_STATUS_LABELS } from '../../lib/appointmentStatus'

interface Doctor {
  id: string
  full_name: string
  specialty: string
  license_state: string
}

interface Patient {
  id: string
  full_name: string
}

interface Appointment {
  id: string
  patient: { id: string; display_name: string }
  doctor: { id: string; display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

interface ScheduleBlock {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

function todayIsoDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toDatetimeLocal(isoDate: string, time: string): string {
  return `${isoDate}T${time}`
}

export function SchedulePage() {
  // Deep links (e.g. "consultas de amanhã" on the home page) can open a given day.
  const [searchParams] = useSearchParams()
  const [date, setDate] = useState(() => searchParams.get('date') ?? todayIsoDate())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [agendaSearch, setAgendaSearch] = useState('')
  const [agendaStatus, setAgendaStatus] = useState('')

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [blockDoctorId, setBlockDoctorId] = useState('')
  const [blockStartTime, setBlockStartTime] = useState('12:00')
  const [blockEndTime, setBlockEndTime] = useState('13:00')
  const [blockReason, setBlockReason] = useState('')
  const [blockError, setBlockError] = useState('')

  async function loadAgenda() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ date })
      if (agendaSearch.trim()) params.set('search', agendaSearch.trim())
      if (agendaStatus) params.set('status', agendaStatus)
      const data = await apiFetch<{ items: Appointment[] }>(`/api/v1/secretary/appointments?${params.toString()}`)
      setAppointments(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a agenda.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadAgenda, agendaSearch ? 300 : 0)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, agendaSearch, agendaStatus])

  useEffect(() => {
    apiFetch<{ items: Doctor[] }>('/api/v1/secretary/appointments/doctors')
      .then((data) => setDoctors(data.items))
      .catch(() => setError('Falha ao carregar médicos disponíveis.'))
  }, [])

  // Real-time: refresh the agenda whenever any appointment changes (created,
  // confirmed, cancelled, or started by a doctor), no manual refresh needed.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const source = new EventSource(apiUrl(`/api/v1/appointments/events?token=${encodeURIComponent(token)}`))
    source.onmessage = () => loadAgenda()
    return () => source.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

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

  useEffect(() => {
    const query = patientQuery.trim()
    if (!query) {
      setPatientResults([])
      return
    }
    const timeout = setTimeout(() => {
      apiFetch<{ items: Patient[] }>(`/api/v1/secretary/appointments/patients?search=${encodeURIComponent(query)}`)
        .then((data) => setPatientResults(data.items))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timeout)
  }, [patientQuery])

  async function handleSchedule(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!selectedPatient || !selectedDoctorId) {
      setError('Selecione um paciente e um médico.')
      return
    }

    try {
      await apiFetch('/api/v1/secretary/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_id: selectedDoctorId,
          starts_at: new Date(toDatetimeLocal(date, startTime)).toISOString(),
          ends_at: new Date(toDatetimeLocal(date, endTime)).toISOString(),
        }),
      })
      setSelectedPatient(null)
      setPatientQuery('')
      setSelectedDoctorId('')
      await loadAgenda()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao agendar consulta.')
    }
  }

  async function confirm(id: string) {
    try {
      await apiFetch(`/api/v1/secretary/appointments/${id}/confirm`, { method: 'POST' })
      await loadAgenda()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao confirmar consulta.')
    }
  }

  async function cancel(id: string) {
    try {
      await apiFetch(`/api/v1/secretary/appointments/${id}/cancel`, { method: 'POST' })
      await loadAgenda()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cancelar consulta.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Agenda da clínica"
        subtitle="Marque, confirme ou cancele consultas com médicos aprovados."
      />

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSchedule}
        className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-2"
      >
        <div className="relative sm:col-span-2">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Paciente</label>
          <input
            type="text"
            value={selectedPatient ? selectedPatient.full_name : patientQuery}
            onChange={(event) => {
              setSelectedPatient(null)
              setPatientQuery(event.target.value)
            }}
            placeholder="Buscar paciente por nome"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          {!selectedPatient && patientResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
              {patientResults.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(patient)
                      setPatientResults([])
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    {patient.full_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Médico</label>
          <select
            value={selectedDoctorId}
            onChange={(event) => setSelectedDoctorId(event.target.value)}
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
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Data</label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Início</label>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Fim</label>
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Agendar consulta
          </button>
        </div>
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Consultas do dia</h2>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <input
          type="text"
          value={agendaSearch}
          onChange={(event) => setAgendaSearch(event.target.value)}
          placeholder="Buscar por nome ou CPF"
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <select
          value={agendaStatus}
          onChange={(event) => setAgendaStatus(event.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        >
          <option value="">Todos os status</option>
          {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Nenhuma consulta nesta data.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">
                  {new Date(appointment.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(appointment.ends_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {appointment.patient.display_name} com {appointment.doctor.display_name}
                </p>
                <div className="mt-1.5">
                  <StatusBadge status={appointment.status} />
                </div>
              </div>

              {(appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') && (
                <div className="flex shrink-0 gap-2">
                  {appointment.status === 'SCHEDULED' && (
                    <button
                      type="button"
                      onClick={() => confirm(appointment.id)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    >
                      Confirmar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cancel(appointment.id)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

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
    </div>
  )
}
