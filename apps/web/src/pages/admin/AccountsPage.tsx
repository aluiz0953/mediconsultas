import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'

interface Account {
  id: string
  email: string
  role: 'ADMIN' | 'SECRETARY' | 'DOCTOR' | 'PATIENT'
  status: 'PENDING' | 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DISABLED'
  full_name: string | null
  created_at: string
}

const INVITABLE_ROLES = ['ADMIN', 'SECRETARY'] as const

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<(typeof INVITABLE_ROLES)[number]>('SECRETARY')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')

  const [statusReason, setStatusReason] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      const query = roleFilter ? `?role=${roleFilter}` : ''
      const data = await apiFetch<{ items: Account[] }>(`/api/v1/admin/accounts${query}`)
      setAccounts(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar contas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter])

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInviteStatus('loading')
    setInviteError('')
    try {
      await apiFetch('/api/v1/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, full_name: inviteName, role: inviteRole }),
      })
      setInviteEmail('')
      setInviteName('')
      setInviteStatus('done')
      await load()
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Falha ao convidar conta.')
      setInviteStatus('error')
    }
  }

  async function changeStatus(account: Account, status: string) {
    const reason = statusReason[account.id] ?? ''
    if (status !== 'ACTIVE' && !reason.trim()) return
    try {
      await apiFetch(`/api/v1/admin/accounts/${account.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: reason.trim() || undefined }),
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao alterar status.')
    }
  }

  async function changeRole(account: Account, role: string) {
    try {
      await apiFetch(`/api/v1/admin/accounts/${account.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao alterar perfil.')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Contas</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pesquise contas existentes e convide novos administradores ou secretários.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-medium text-slate-900 dark:text-white">Convidar conta</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Médicos e pacientes se cadastram sozinhos; este convite é só para ADMIN e SECRETARY.
        </p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleInvite}>
          <div>
            <label htmlFor="invite_email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              E-mail
            </label>
            <input
              id="invite_email"
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="invite_name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nome
            </label>
            <input
              id="invite_name"
              type="text"
              required
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="invite_role" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Perfil
            </label>
            <select
              id="invite_role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as (typeof INVITABLE_ROLES)[number])}
              className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={inviteStatus === 'loading'}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviteStatus === 'loading' ? 'Enviando…' : 'Convidar'}
          </button>
        </form>
        {inviteStatus === 'error' && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {inviteError}
          </p>
        )}
        {inviteStatus === 'done' && (
          <p role="status" className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
            Convite enviado.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-900 dark:text-white">Contas existentes</h2>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Todos os perfis</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SECRETARY">SECRETARY</option>
            <option value="DOCTOR">DOCTOR</option>
            <option value="PATIENT">PATIENT</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
        ) : accounts.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Nenhuma conta encontrada.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{account.full_name ?? account.email}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {account.email} · {account.role} · {account.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {INVITABLE_ROLES.includes(account.role as (typeof INVITABLE_ROLES)[number]) && (
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value) changeRole(account, event.target.value)
                          event.target.value = ''
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300"
                      >
                        <option value="">Mudar perfil…</option>
                        {INVITABLE_ROLES.filter((role) => role !== account.role).map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      placeholder="Justificativa"
                      value={statusReason[account.id] ?? ''}
                      onChange={(event) => setStatusReason((current) => ({ ...current, [account.id]: event.target.value }))}
                      className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />

                    <select
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) changeStatus(account, event.target.value)
                        event.target.value = ''
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300"
                    >
                      <option value="">Mudar status…</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="LOCKED">LOCKED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="DISABLED">DISABLED</option>
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
