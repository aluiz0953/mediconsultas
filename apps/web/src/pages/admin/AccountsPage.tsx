import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { getCurrentUser } from '../../lib/auth'

// Reflects the requireRole(...) guards actually mounted in apps/api/src/index.ts —
// keep this in sync by hand if a route's role guard changes.
const RBAC_ROWS: { module: string; PATIENT: string; SECRETARY: string; DOCTOR: string; ADMIN: string }[] = [
  { module: 'Cadastro (paciente/médico)', PATIENT: 'Autoatendimento', SECRETARY: 'Sem acesso', DOCTOR: 'Autoatendimento', ADMIN: 'Sem acesso' },
  { module: 'Agenda da clínica', PATIENT: 'Sem acesso', SECRETARY: 'Total', DOCTOR: 'Sem acesso', ADMIN: 'Total' },
  { module: 'Fila de atendimento própria', PATIENT: 'Sem acesso', SECRETARY: 'Sem acesso', DOCTOR: 'Total', ADMIN: 'Sem acesso' },
  { module: 'Minhas consultas/documentos', PATIENT: 'Total', SECRETARY: 'Sem acesso', DOCTOR: 'Sem acesso', ADMIN: 'Sem acesso' },
  { module: 'Prontuário e receita', PATIENT: 'Leitura (PDF)', SECRETARY: 'Sem acesso', DOCTOR: 'Emissão', ADMIN: 'Sem acesso' },
  { module: 'Aprovação de médicos', PATIENT: 'Sem acesso', SECRETARY: 'Sem acesso', DOCTOR: 'Sem acesso', ADMIN: 'Total' },
  { module: 'Contas (ADMIN/SECRETARY)', PATIENT: 'Sem acesso', SECRETARY: 'Sem acesso', DOCTOR: 'Sem acesso', ADMIN: 'Total' },
  { module: 'Log de auditoria', PATIENT: 'Sem acesso', SECRETARY: 'Sem acesso', DOCTOR: 'Sem acesso', ADMIN: 'Total' },
  { module: 'Próprio perfil (nome/e-mail/senha)', PATIENT: 'Total', SECRETARY: 'Total', DOCTOR: 'Total', ADMIN: 'Total' },
]

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
  const [inviteRole, setInviteRole] = useState<(typeof INVITABLE_ROLES)[number]>('SECRETARY')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')

  const [statusReason, setStatusReason] = useState<Record<string, string>>({})
  const currentUserId = getCurrentUser()?.sub

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
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      setInviteEmail('')
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

  async function removeAccount(account: Account) {
    const reason = (statusReason[account.id] ?? '').trim()
    if (!reason) {
      setError('Preencha a justificativa antes de remover a conta.')
      return
    }
    const name = account.full_name ?? account.email
    if (!window.confirm(`Remover a conta de ${name}? Ela deixa de aparecer aqui e não consegue mais entrar. O histórico clínico é mantido.`)) return
    setError('')
    try {
      await apiFetch(`/api/v1/admin/accounts/${account.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover conta.')
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
      <PageHeader
        title="Contas"
        subtitle="Pesquise contas e convide contas existentes para serem administradores ou secretárias."
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-medium text-neutral-900 dark:text-white">Matriz de permissões (RBAC)</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Acesso por perfil, conforme configurado nas rotas da API.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Módulo</th>
                <th className="px-3 py-1.5 font-semibold">Paciente</th>
                <th className="px-3 py-1.5 font-semibold">Secretária</th>
                <th className="px-3 py-1.5 font-semibold">Médico</th>
                <th className="px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-400">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {RBAC_ROWS.map((row) => (
                <tr key={row.module}>
                  <td className="py-2 pr-3 font-medium text-neutral-900 dark:text-white">{row.module}</td>
                  <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{row.PATIENT}</td>
                  <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{row.SECRETARY}</td>
                  <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{row.DOCTOR}</td>
                  <td className="px-3 py-2 font-medium text-emerald-700 dark:text-emerald-400">{row.ADMIN}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-medium text-neutral-900 dark:text-white">Convidar conta</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          A pessoa precisa já ter uma conta. Ela recebe o convite ao entrar e o perfil só muda quando ela aceitar.
        </p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleInvite}>
          <div>
            <label htmlFor="invite_email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              E-mail
            </label>
            <input
              id="invite_email"
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="mt-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="invite_role" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Perfil
            </label>
            <select
              id="invite_role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as (typeof INVITABLE_ROLES)[number])}
              className="mt-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
            Convite enviado. A pessoa verá o convite na próxima vez que abrir a conta.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-neutral-900 dark:text-white">Contas existentes</h2>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
        ) : accounts.length === 0 ? (
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Nenhuma conta encontrada.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{account.full_name ?? account.email}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
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
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
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
                      className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />

                    <select
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) changeStatus(account, event.target.value)
                        event.target.value = ''
                      }}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <option value="">Mudar status…</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="LOCKED">LOCKED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="DISABLED">DISABLED</option>
                    </select>

                    {account.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => removeAccount(account)}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Remover
                      </button>
                    )}
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
