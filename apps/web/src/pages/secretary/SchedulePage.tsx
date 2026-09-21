import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'

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

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
  PATIENT_ABSENT: 'Paciente faltou',
  DOCTOR_ABSENT: 'Médico faltou',
}

function todayIsoDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toDatetimeLocal(isoDate: string, time: string): string {
  return `${isoDate}T${time}`
}

export function SchedulePage() {
  const [date, setDate] = useState(todayIsoDate)
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

  async function loadAgenda() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ items: Appointment[] }>(`/api/v1/secretary/appointments?date=${date}`)
      setAppointments(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a agenda.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgenda()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => {
    apiFetch<{ items: Doctor[] }>('/api/v1/secretary/appointments/doctors')
      .then((data) => setDoctors(data.items))
      .catch(() => setError('Falha ao carregar médicos disponíveis.'))
  }, [])

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
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Agenda de consultas</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Marque, confirme ou cancele consultas com médicos aprovados.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSchedule}
        className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2"
      >
        <div className="relative sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Paciente</label>
          <input
            type="text"
            value={selectedPatient ? selectedPatient.full_name : patientQuery}
            onChange={(event) => {
              setSelectedPatient(null)
              setPatientQuery(event.target.value)
            }}
            placeholder="Buscar paciente por nome"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {!selectedPatient && patientResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {patientResults.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(patient)
                      setPatientResults([])
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-gray-700"
                  >
                    {patient.full_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Médico</label>
          <select
            value={selectedDoctorId}
            onChange={(event) => setSelectedDoctorId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data</label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Início</label>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fim</label>
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Agendar consulta
          </button>
        </div>
      </form>

      <div className="mt-8 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Consultas do dia</h2>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Nenhuma consulta nesta data.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {new Date(appointment.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(appointment.ends_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {appointment.patient.display_name} com {appointment.doctor.display_name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {STATUS_LABELS[appointment.status] ?? appointment.status}
                </p>
              </div>

              {(appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') && (
                <div className="flex shrink-0 gap-2">
                  {appointment.status === 'SCHEDULED' && (
                    <button
                      type="button"
                      onClick={() => confirm(appointment.id)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      Confirmar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cancel(appointment.id)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
                  >
                    Cancelar
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
