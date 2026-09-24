import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api'
import { setToken } from '../lib/auth'

interface Invitation {
  id: string
  role: 'ADMIN' | 'SECRETARY'
  created_at: string
}

const ROLE_NAME: Record<Invitation['role'], string> = {
  ADMIN: 'administrador',
  SECRETARY: 'secretária',
}

// Shown on every page of the signed-in shell while the account has a pending
// role invitation from an admin (ADM-03).
export function InvitationBanner() {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<{ items: Invitation[] }>('/api/v1/me/invitations')
      .then((data) => setInvitation(data.items[0] ?? null))
      .catch(() => {})
  }, [])

  if (!invitation) return null

  async function answer(accept: boolean) {
    if (!invitation) return
    setBusy(true)
    setError('')
    try {
      const result = await apiFetch<{ access_token: string } | undefined>(
        `/api/v1/me/invitations/${invitation.id}/${accept ? 'accept' : 'decline'}`,
        { method: 'POST' },
      )
      if (accept && result) {
        setToken(result.access_token)
        // Full reload so the menu, guards and home page all pick up the new role.
        window.location.assign('/')
        return
      }
      setInvitation(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao responder o convite.')
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          Você recebeu um convite para ser {ROLE_NAME[invitation.role]}
        </p>
        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
          Ao aceitar, sua conta passa a ter esse perfil e o menu muda.
        </p>
        {error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => answer(false)}
          className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        >
          Recusar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => answer(true)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
