import { useSearchParams } from 'react-router-dom'
import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError, subscribeAppointmentEvents } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { APPOINTMENT_STATUS_LABELS } from '../../lib/appointmentStatus'
import { toDatetimeLocal } from '../../lib/datetime'
import { ScheduleBlocks } from './ScheduleBlocks'
import { SkeletonRows } from '../../components/Skeleton'

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

function todayIsoDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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


  // `silent` refreshes in the background (after an action or a live event) without
  // swapping the list for the loading spinner.
  async function loadAgenda(silent = false) {
    if (!silent) setLoading(true)
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
    return subscribeAppointmentEvents(() => loadAgenda(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

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

  // Optimistic: the new status shows immediately (the server round trip is slow on
  // mobile networks); if the server refuses, the previous list comes back.
  async function changeStatus(id: string, action: 'confirm' | 'cancel', status: string, failure: string) {
    const previous = appointments
    setAppointments((list) => list.map((appointment) => (appointment.id === id ? { ...appointment, status } : appointment)))
    try {
      await apiFetch(`/api/v1/secretary/appointments/${id}/${action}`, { method: 'POST' })
      void loadAgenda(true)
    } catch (err) {
      setAppointments(previous)
      setError(err instanceof ApiError ? err.message : failure)
    }
  }

  const confirm = (id: string) => changeStatus(id, 'confirm', 'CONFIRMED', 'Falha ao confirmar consulta.')
  const cancel = (id: string) => changeStatus(id, 'cancel', 'CANCELLED', 'Falha ao cancelar consulta.')

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
        <SkeletonRows count={3} className="mt-4" />
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

      <ScheduleBlocks date={date} doctors={doctors} />
    </div>
  )
}
