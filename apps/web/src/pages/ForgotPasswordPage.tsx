import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    try {
      await fetch('/api/v1/auth/password-reset/request', {
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
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Informe seu e-mail para receber um link de redefinição.
        </p>

        {status === 'done' ? (
          <p role="status" className="mt-6 text-sm text-emerald-600 dark:text-emerald-400">
            Se o e-mail existir, um link de redefinição foi enviado.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ? 'Enviando…' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link to="/login" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  )
}
