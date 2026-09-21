import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'

interface ApiError {
  code: string
  message: string
}

// Used both for PAT-03 (forgot password) and for an admin-invited account
// (ADM-03) setting its first password — same token mechanics on the backend.
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [newPassword, setNewPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const response = await fetch('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      })

      if (!response.ok) {
        const body = (await response.json()) as ApiError
        setErrorMessage(body.message)
        setStatus('error')
        return
      }

      navigate('/login', { replace: true })
    } catch {
      setErrorMessage('Não foi possível conectar à API.')
      setStatus('error')
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Definir nova senha</h1>

        {!token ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            Link inválido: nenhum token encontrado na URL.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="new_password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Nova senha
              </label>
              <input
                id="new_password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Ao menos 10 caracteres, com maiúscula, minúscula, número e símbolo.
              </p>
            </div>

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
              {status === 'loading' ? 'Salvando…' : 'Salvar nova senha'}
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
