import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { clearToken, getCurrentUser, type Role } from '../lib/auth'

const NAV_LINK_CLASS =
  'block rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-gray-800 aria-[current=page]:bg-emerald-50 aria-[current=page]:text-emerald-700 dark:aria-[current=page]:bg-emerald-900/30 dark:aria-[current=page]:text-emerald-400'

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SECRETARY: 'Secretário',
  DOCTOR: 'Médico',
  PATIENT: 'Paciente',
}

export function AppShell() {
  const navigate = useNavigate()
  const user = getCurrentUser()

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white px-4 py-6 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">MediConsultas</p>
        {user && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</p>
        )}

        <nav className="mt-6 space-y-1">
          <NavLink to="/" end className={NAV_LINK_CLASS}>
            Início
          </NavLink>
          {user?.role === 'ADMIN' && (
            <>
              <NavLink to="/admin/doctors" className={NAV_LINK_CLASS}>
                Aprovação de médicos
              </NavLink>
              <NavLink to="/admin/audit" className={NAV_LINK_CLASS}>
                Auditoria
              </NavLink>
            </>
          )}
          {(user?.role === 'SECRETARY' || user?.role === 'ADMIN') && (
            <NavLink to="/secretary/schedule" className={NAV_LINK_CLASS}>
              Agenda de consultas
            </NavLink>
          )}
          {user?.role === 'DOCTOR' && (
            <NavLink to="/doctor/queue" className={NAV_LINK_CLASS}>
              Fila de atendimento
            </NavLink>
          )}
          {user?.role === 'PATIENT' && (
            <>
              <NavLink to="/patient/appointments" className={NAV_LINK_CLASS}>
                Minhas consultas
              </NavLink>
              <NavLink to="/patient/records" className={NAV_LINK_CLASS}>
                Meus documentos
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 p-4 dark:border-gray-800">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800"
          >
            Sair
          </button>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
