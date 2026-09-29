import { type FormEvent, useEffect, useState } from 'react'
import { apiUrl } from '../lib/api'

type Channel = 'email' | 'sms'

interface Props {
  email: string
  phone: string
  // Creates the account with the confirmed verification; resolves to an error message on failure.
  onVerified: (verificationId: string) => Promise<string | null>
  onBack: () => void
  // Value of the hidden trap field from the previous step (see HoneypotField).
  honeypot: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message ?? 'Erro inesperado.')
  return data as T
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `(${digits.slice(0, 2)}) •••••-${digits.slice(-4)}`
}

// Sign-up step 2: the person picks e-mail or SMS, receives a 6-digit code and
// confirms it; only then is the account actually created.
export function VerificationStep({ email, phone, onVerified, onBack, honeypot }: Props) {
  const hasPhone = phone.replace(/\D/g, '').length >= 10
  const [channel, setChannel] = useState<Channel>('email')
  const [verificationId, setVerificationId] = useState('')
  const [devCode, setDevCode] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode() {
    setBusy(true)
    setError('')
    try {
      const data = await post<{ id: string; dev_code?: string }>('/api/v1/verifications', {
        website: honeypot,
        channel,
        destination: channel === 'email' ? email : phone,
      })
      setVerificationId(data.id)
      setDevCode(data.dev_code ?? '')
      setCode('')
      setCooldown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar o código.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post(`/api/v1/verifications/${verificationId}/confirm`, { code })
      const failure = await onVerified(verificationId)
      if (failure) setError(failure)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao confirmar o código.')
    } finally {
      setBusy(false)
    }
  }

  const destination = channel === 'email' ? maskEmail(email) : maskPhone(phone)
  const optionClass =
    'flex w-full items-start gap-3 rounded-lg border border-neutral-200 p-3 text-left transition hover:border-emerald-400 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50/60 dark:border-neutral-700 dark:has-[:checked]:bg-emerald-950/30'

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Confirme seu contato</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Vamos enviar um código de 6 dígitos para confirmar que o contato é seu.
        </p>
      </div>

      {!verificationId ? (
        <>
          <fieldset className="space-y-2">
            <legend className="sr-only">Como receber o código</legend>
            <label className={optionClass}>
              <input type="radio" name="channel" checked={channel === 'email'} onChange={() => setChannel('email')} className="mt-1 accent-emerald-600" />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">Por e-mail</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{maskEmail(email)}</span>
              </span>
            </label>
            <label className={`${optionClass} ${hasPhone ? '' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="radio"
                name="channel"
                disabled={!hasPhone}
                checked={channel === 'sms'}
                onChange={() => setChannel('sms')}
                className="mt-1 accent-emerald-600"
              />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">Por SMS</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {hasPhone ? maskPhone(phone) : 'Informe um celular no formulário para usar esta opção.'}
                </span>
              </span>
            </label>
          </fieldset>
          <button
            type="button"
            disabled={busy}
            onClick={sendCode}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Enviando…' : 'Enviar código'}
          </button>
        </>
      ) : (
        <form className="space-y-4" onSubmit={confirm}>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Código enviado {channel === 'email' ? 'para o e-mail' : 'por SMS para'} <strong>{destination}</strong>. Ele vale 10 minutos.
          </p>
          {devCode && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              Ambiente de teste, sem envio real. Seu código: <strong data-testid="dev-code">{devCode}</strong>
            </p>
          )}
          <div>
            <label htmlFor="verification_code" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Código de verificação
            </label>
            <input
              id="verification_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              pattern="\d{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="mt-1 w-40 rounded-md border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.4em] text-neutral-900 tabular-nums outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Confirmando…' : 'Confirmar e criar conta'}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              disabled={cooldown > 0 || busy}
              onClick={sendCode}
              className="font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline dark:text-emerald-400"
            >
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
            </button>
            <button
              type="button"
              onClick={() => setVerificationId('')}
              className="font-medium text-neutral-600 hover:underline dark:text-neutral-300"
            >
              Trocar forma de envio
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button type="button" onClick={onBack} className="text-sm font-medium text-neutral-600 hover:underline dark:text-neutral-300">
        ← Voltar e editar os dados
      </button>
    </div>
  )
}
