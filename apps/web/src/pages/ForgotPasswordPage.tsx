import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../lib/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    try {
      await fetch(apiUrl('/api/v1/auth/password-reset/request'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } finally {
      // PAT-03: always show the same generic confirmation, whether or not the e-mail exists.
      setStatus('done')
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Informe seu e-mail para receber um link de redefinição.
        </p>

        {status === 'done' ? (
          <p role="status" className="mt-6 text-sm text-emerald-600 dark:text-emerald-400">
            Se o e-mail existir, um link de redefinição foi enviado.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ? 'Enviando…' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          <Link to="/login" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  )
}
