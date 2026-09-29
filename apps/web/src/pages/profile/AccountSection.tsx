import { type FormEvent, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { Field } from './Field'

export function AccountSection() {
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
