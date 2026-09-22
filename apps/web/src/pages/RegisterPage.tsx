import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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

export function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function update<K extends keyof FormState>(key: K) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const response = await fetch('/api/v1/patients/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const body = (await response.json()) as ApiError
        setErrorMessage(body.message)
        setStatus('error')
        return
      }

      navigate('/login', { replace: true, state: { justRegistered: true } })
    } catch {
      setErrorMessage('Não foi possível conectar à API. Ela está rodando em localhost:8000?')
      setStatus('error')
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Criar conta de paciente</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Leva menos de um minuto.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Nome completo" id="full_name" value={form.full_name} onChange={update('full_name')} required />
          <Field label="CPF" id="cpf" value={form.cpf} onChange={update('cpf')} placeholder="000.000.000-00" required />
          <Field label="Data de nascimento" id="birth_date" type="date" value={form.birth_date} onChange={update('birth_date')} required />
          <Field label="E-mail" id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} required />
          <Field label="Telefone" id="phone" type="tel" value={form.phone} onChange={update('phone')} required />
          <Field label="Endereço" id="address" value={form.address} onChange={update('address')} required />
          <Field
            label="Senha"
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            required
            helpText="Ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo."
          />

          {status === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'loading' ? 'Enviando…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
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
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      {helpText && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{helpText}</p>}
    </div>
  )
}
