import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api'
import { AddressFields } from '../components/AddressFields'
import { EMPTY_ADDRESS, parseAddress, serializeAddress, type Address } from '../lib/address'
import { getCurrentUser, type Role } from '../lib/auth'
import { PageHeader } from '../components/PageHeader'
import { ThemeToggle } from '../components/ThemeToggle'
import { UserIcon } from '../components/icons'

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SECRETARY: 'Secretária',
  DOCTOR: 'Médico',
  PATIENT: 'Paciente',
}

interface RoleProfile {
  full_name: string
  email: string
  phone: string | null
  address: string | null
  cpf_masked?: string
  specialty?: string
  license_state?: string
  approval_status?: string
}

const PROFILE_PATH: Partial<Record<string, string>> = {
  PATIENT: '/api/v1/patient/me',
  DOCTOR: '/api/v1/doctor/me',
}

// ADMIN/SECRETARY have no role-specific profile table (see account.ts), so
// they get a lighter name-only section instead of RoleProfileSection.
const NAME_ONLY_ROLES: Role[] = ['ADMIN', 'SECRETARY']

export function ProfilePage() {
  const user = getCurrentUser()
  const path = user ? PROFILE_PATH[user.role] : undefined
  const showNameSection = user ? NAME_ONLY_ROLES.includes(user.role) : false

  return (
    <div className="max-w-3xl">
      <PageHeader title="Meu perfil" subtitle="Gerencie seus dados de contato, e-mail e senha." />

      <div className="mt-6 flex flex-col gap-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-900 sm:w-48">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            <UserIcon className="h-7 w-7" />
          </span>
          {user && <p className="text-sm font-medium text-neutral-900 dark:text-white">{ROLE_LABELS[user.role]}</p>}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">MediConsultas</p>
        </div>

        <div className="flex-1 space-y-6">
          {showNameSection && <NameSection />}
          {path && <RoleProfileSection path={path} />}
          <AccountSection />

          <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="font-medium text-neutral-900 dark:text-white">Preferências</h2>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Tema da interface</p>
              <ThemeToggle />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function NameSection() {
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<{ full_name: string | null }>('/api/v1/me')
      .then((data) => setFullName(data.full_name ?? ''))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar perfil.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError('')
    try {
      await apiFetch('/api/v1/me/profile', { method: 'PATCH', body: JSON.stringify({ full_name: fullName }) })
      setStatus('saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar perfil.')
      setStatus('error')
    }
  }

  if (loading) return <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium text-neutral-900 dark:text-white">Dados pessoais</h2>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <Field label="Nome completo" id="full_name" value={fullName} onChange={setFullName} required />

        {status === 'error' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {status === 'saved' && (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Perfil atualizado.
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'saving' ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>
    </section>
  )
}

function RoleProfileSection({ path }: { path: string }) {
  const [profile, setProfile] = useState<RoleProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<RoleProfile>(path)
      .then((data) => {
        setProfile(data)
        setFullName(data.full_name)
        setPhone(data.phone ?? '')
        setAddress(parseAddress(data.address))
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar perfil.'))
      .finally(() => setLoading(false))
  }, [path])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError('')
    try {
      const updated = await apiFetch<RoleProfile>(path, {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName, phone, address: serializeAddress(address) }),
      })
      setProfile((current) => (current ? { ...current, ...updated } : current))
      setStatus('saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar perfil.')
      setStatus('error')
    }
  }

  if (loading) return <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium text-neutral-900 dark:text-white">Dados pessoais</h2>

      {profile?.cpf_masked && (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">CPF: {profile.cpf_masked}</p>
      )}
      {profile?.specialty && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {profile.specialty} · CRM/{profile.license_state} · {profile.approval_status}
        </p>
      )}

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <Field label="Nome completo" id="full_name" value={fullName} onChange={setFullName} required />
        <Field label="Telefone" id="phone" type="tel" value={phone} onChange={setPhone} />
        <AddressFields value={address} onChange={setAddress} />

        {status === 'error' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {status === 'saved' && (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Perfil atualizado.
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'saving' ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>
    </section>
  )
}

function AccountSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [passwordError, setPasswordError] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [emailError, setEmailError] = useState('')

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordStatus('saving')
    setPasswordError('')
    try {
      await apiFetch('/api/v1/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setPasswordStatus('saved')
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Falha ao trocar a senha.')
      setPasswordStatus('error')
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailStatus('saving')
    setEmailError('')
    try {
      await apiFetch('/api/v1/me/email', {
        method: 'PATCH',
        body: JSON.stringify({ new_email: newEmail, current_password: emailPassword }),
      })
      setNewEmail('')
      setEmailPassword('')
      setEmailStatus('saved')
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.message : 'Falha ao trocar o e-mail.')
      setEmailStatus('error')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-medium text-neutral-900 dark:text-white">Alterar senha</h2>
        <form className="mt-4 space-y-4" onSubmit={handlePasswordSubmit}>
          <Field
            label="Senha atual"
            id="current_password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
          <Field
            label="Nova senha"
            id="new_password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            required
            helpText="Ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo."
          />

          {passwordStatus === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {passwordError}
            </p>
          )}
          {passwordStatus === 'saved' && (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
              Senha atualizada.
            </p>
          )}

          <button
            type="submit"
            disabled={passwordStatus === 'saving'}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {passwordStatus === 'saving' ? 'Salvando…' : 'Atualizar senha'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-medium text-neutral-900 dark:text-white">Alterar e-mail</h2>
        <form className="mt-4 space-y-4" onSubmit={handleEmailSubmit}>
          <Field label="Novo e-mail" id="new_email" type="email" value={newEmail} onChange={setNewEmail} required />
          <Field
            label="Senha atual"
            id="email_current_password"
            type="password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={setEmailPassword}
            required
          />

          {emailStatus === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {emailError}
            </p>
          )}
          {emailStatus === 'saved' && (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
              E-mail atualizado.
            </p>
          )}

          <button
            type="submit"
            disabled={emailStatus === 'saving'}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {emailStatus === 'saving' ? 'Salvando…' : 'Atualizar e-mail'}
          </button>
        </form>
      </section>
    </div>
  )
}

interface FieldProps {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
  helpText?: string
}

function Field({ label, id, value, onChange, type = 'text', autoComplete, required, helpText }: FieldProps) {
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
      />
      {helpText && <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{helpText}</p>}
    </div>
  )
}
