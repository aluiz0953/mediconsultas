import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { type Role } from '../../lib/auth'
import { PageHeader } from '../../components/PageHeader'
import { DAY_MS, errorText, plural, type Notice } from './format'
import { ErrorLine, NoticeList } from './panels'
import { MyAppointments } from './MyAppointments'

export function AdminDashboard() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: unknown[] }>('/api/v1/admin/doctors/pending'),
      apiFetch<{ items: { role: Role; status: string }[] }>('/api/v1/admin/accounts'),
      apiFetch<{ items: { created_at: string }[] }>('/api/v1/admin/audit-events?action=auth.login_failed'),
    ])
      .then(([doctors, accounts, failedLogins]) => {
        // Pending doctors already have their own row; don't count them twice.
        const accountIssues = accounts.items.filter(
          (a) => a.status === 'LOCKED' || a.status === 'SUSPENDED' || (a.status === 'PENDING' && a.role !== 'DOCTOR'),
        ).length
        const since = Date.now() - DAY_MS
        const recentFailures = failedLogins.items.filter((e) => new Date(e.created_at).getTime() >= since).length

        const all: Notice[] = [
          {
            to: '/admin/doctors',
            count: doctors.items.length,
            title: plural(doctors.items.length, 'Médico aguardando aprovação', 'Médicos aguardando aprovação'),
            detail: 'Revise o CRM e aprove ou rejeite o cadastro.',
            tone: 'amber',
          },
          {
            to: '/admin/accounts',
            count: accountIssues,
            title: plural(accountIssues, 'Conta precisa de atenção', 'Contas precisam de atenção'),
            detail: 'Contas pendentes, bloqueadas ou suspensas.',
            tone: 'amber',
          },
          {
            to: '/admin/audit?action=auth.login_failed',
            count: recentFailures,
            title: plural(recentFailures, 'Login falhou nas últimas 24h', 'Logins falharam nas últimas 24h'),
            detail: 'Confira na auditoria se há tentativas suspeitas.',
            tone: 'red',
          },
        ]
        setNotices(all.filter((notice) => (notice.count ?? 0) > 0))
      })
      .catch((err) => setError(errorText(err, 'Falha ao carregar as pendências.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Bem-vindo de volta" subtitle="O que precisa da sua atenção no sistema agora." />
      <ErrorLine message={error} />
      <div className="mt-6">
        <NoticeList notices={notices} loading={loading} />
      </div>
      <div className="mt-6">
        <MyAppointments />
      </div>
    </div>
  )
}
