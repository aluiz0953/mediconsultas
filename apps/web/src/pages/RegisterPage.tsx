import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiUrl } from '../lib/api'
import { VerificationStep } from '../components/VerificationStep'
import { AddressFields, EMPTY_ADDRESS, serializeAddress, type Address } from '../components/AddressFields'

interface ApiError {
  code: string
  message: string
}

interface FormState {
  full_name: string
  cpf: string
  birth_date: string
  email: string
  phone: string
  address: string
  password: string
}

const INITIAL_STATE: FormState = {
  full_name: '',
  cpf: '',
  birth_date: '',
  email: '',
  phone: '',
  address: '',
  password: '',
}

interface DoctorFormState {
  full_name: string
  license_number: string
  license_state: string
  specialty: string
  email: string
  phone: string
  password: string
}

const INITIAL_DOCTOR_STATE: DoctorFormState = {
  full_name: '',
  license_number: '',
  license_state: '',
  specialty: '',
  email: '',
  phone: '',
  password: '',
}

// Mirrors apps/api/src/validation/brazilian-uf.ts.
const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const PASSWORD_HELP = 'Ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo.'

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white'

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isDoctor = searchParams.get('tipo') === 'medico'
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS)
  const [doctorForm, setDoctorForm] = useState<DoctorFormState>(INITIAL_DOCTOR_STATE)
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function update<K extends keyof FormState>(key: K) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  function updateDoctor<K extends keyof DoctorFormState>(key: K) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDoctorForm((current) => ({ ...current, [key]: event.target.value }))
  }

  function switchKind(doctor: boolean) {
    setSearchParams(doctor ? { tipo: 'medico' } : {}, { replace: true })
    setStatus('idle')
    setErrorMessage('')
  }

  // Step 1 only validates the form (native `required`); the account is
  // created in step 2, after the contact code is confirmed.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setStep('verify')
  }

  async function register(verificationId: string): Promise<string | null> {
    try {
      const payload = isDoctor ? doctorForm : { ...form, address: serializeAddress(address) }
      const response = await fetch(apiUrl(isDoctor ? '/api/v1/doctors/register' : '/api/v1/patients/register'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, verification_id: verificationId }),
      })

      if (!response.ok) {
        const body = (await response.json()) as ApiError
        return body.message
      }

      navigate('/login', { replace: true, state: { justRegistered: isDoctor ? 'doctor' : 'patient' } })
      return null
    } catch {
      return 'Não foi possível conectar à API. Ela está rodando em localhost:8000?'
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
          {isDoctor ? 'Criar conta de médico' : 'Criar conta de paciente'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {isDoctor ? 'Seu acesso é liberado depois que a administração conferir o CRM.' : 'Leva menos de um minuto.'}
        </p>

        {step === 'verify' ? (
          <VerificationStep
            email={isDoctor ? doctorForm.email : form.email}
            phone={isDoctor ? doctorForm.phone : form.phone}
            onVerified={register}
            onBack={() => setStep('form')}
          />
        ) : (
        <>
        <div role="group" aria-label="Tipo de conta" className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {[
            { doctor: false, label: 'Sou paciente' },
            { doctor: true, label: 'Sou médico' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={isDoctor === option.doctor}
              onClick={() => switchKind(option.doctor)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 aria-pressed:bg-white aria-pressed:text-emerald-700 aria-pressed:shadow-sm dark:text-neutral-400 dark:hover:text-white dark:aria-pressed:bg-neutral-900 dark:aria-pressed:text-emerald-400"
            >
              {option.label}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {isDoctor ? (
            <>
              <Field label="Nome completo" id="full_name" value={doctorForm.full_name} onChange={updateDoctor('full_name')} required />
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="CRM" id="license_number" value={doctorForm.license_number} onChange={updateDoctor('license_number')} placeholder="123456" required />
                <div>
                  <label htmlFor="license_state" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    UF
                  </label>
                  <select id="license_state" required value={doctorForm.license_state} onChange={updateDoctor('license_state')} className={INPUT_CLASS}>
                    <option value="" disabled>
                      UF
                    </option>
                    {BRAZILIAN_UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Field label="Especialidade" id="specialty" value={doctorForm.specialty} onChange={updateDoctor('specialty')} placeholder="Clínica Geral" required />
              <Field label="E-mail" id="email" type="email" autoComplete="email" value={doctorForm.email} onChange={updateDoctor('email')} required />
              <Field
                label="Celular"
                id="phone"
                type="tel"
                autoComplete="tel"
                value={doctorForm.phone}
                onChange={updateDoctor('phone')}
                placeholder="(11) 99999-9999"
                helpText="Opcional. Preencha para poder receber o código por SMS."
              />
              <Field
                label="Senha"
                id="password"
                type="password"
                autoComplete="new-password"
                value={doctorForm.password}
                onChange={updateDoctor('password')}
                required
                helpText={PASSWORD_HELP}
              />
            </>
          ) : (
            <>
              <Field label="Nome completo" id="full_name" value={form.full_name} onChange={update('full_name')} required />
              <Field label="CPF" id="cpf" value={form.cpf} onChange={update('cpf')} placeholder="000.000.000-00" required />
              <Field label="Data de nascimento" id="birth_date" type="date" value={form.birth_date} onChange={update('birth_date')} required />
              <Field label="E-mail" id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} required />
              <Field label="Telefone" id="phone" type="tel" value={form.phone} onChange={update('phone')} required />
              <AddressFields value={address} onChange={setAddress} required />
              <Field
                label="Senha"
                id="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={update('password')}
                required
                helpText={PASSWORD_HELP}
              />
            </>
          )}

          {status === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'loading' ? 'Enviando…' : 'Criar conta'}
          </button>
        </form>
        </>
        )}

        <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  id: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  autoComplete?: string
  placeholder?: string
  required?: boolean
  helpText?: string
}

function Field({ label, id, value, onChange, type = 'text', autoComplete, placeholder, required, helpText }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={INPUT_CLASS}
      />
      {helpText && <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{helpText}</p>}
    </div>
  )
}
