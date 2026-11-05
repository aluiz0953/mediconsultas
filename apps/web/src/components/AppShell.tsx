import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearToken, getCurrentUser, type Role } from '../lib/auth'
import { InvitationBanner } from './InvitationBanner'
import {
  CalendarIcon,
  GridIcon,
  HeartLogo,
  LockIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  XIcon,
} from './icons'
import type { ComponentType, SVGProps } from 'react'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SECRETARY: 'Secretária',
  DOCTOR: 'Médico',
  PATIENT: 'Paciente',
}

const ROLE_ZONE: Record<Role, string> = {
  ADMIN: 'Painel administrativo',
  SECRETARY: 'Central da secretaria',
  DOCTOR: 'Área do médico',
  PATIENT: 'Área do paciente',
}

interface NavItem {
  to: string
  label: string
  icon: IconType
  end?: boolean
}

function navForRole(role: Role | undefined): { main: NavItem[]; management: NavItem[] } {
  const main: NavItem[] = [{ to: '/', label: 'Início', icon: GridIcon, end: true }]

  if (role === 'SECRETARY' || role === 'ADMIN') {
    main.push({ to: '/secretary/schedule', label: 'Agenda de consultas', icon: CalendarIcon })
    main.push({ to: '/secretary/clinic-settings', label: 'Configurações da clínica', icon: SettingsIcon })
  }
  if (role === 'DOCTOR') {
    main.push({ to: '/doctor/queue', label: 'Fila de atendimento', icon: CalendarIcon })
  }
  if (role === 'PATIENT') {
    main.push({ to: '/patient/appointments', label: 'Minhas consultas', icon: CalendarIcon })
    main.push({ to: '/patient/records', label: 'Meus documentos', icon: GridIcon })
  }
  main.push({ to: '/perfil', label: 'Meu perfil', icon: UserIcon })

  const management: NavItem[] = []
  if (role === 'ADMIN') {
    management.push({ to: '/admin/doctors', label: 'Aprovação de médicos', icon: UserIcon })
    management.push({ to: '/admin/accounts', label: 'Contas', icon: UserIcon })
    management.push({ to: '/admin/audit', label: 'Auditoria', icon: LockIcon })
  }

  return { main, management }
}

const TAB_CLASS =
  'relative flex h-11 items-center gap-3 rounded-md px-[19px] text-sm font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 aria-[current=page]:bg-emerald-700 aria-[current=page]:text-white dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white dark:aria-[current=page]:bg-emerald-700'

// In the rail the label stays out of sight until the rail is hovered or focused; in the drawer it is always shown.
const RAIL_LABEL =
  'whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 motion-reduce:transition-none'

function NavSection({
  title,
  items,
  rail,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  rail: boolean
  onNavigate?: () => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-6 border-t border-neutral-200 pt-4 first:mt-0 first:border-0 first:pt-0 dark:border-neutral-800">
      <p className={`mb-1 px-[19px] text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400 ${rail ? RAIL_LABEL : ''}`}>
        {title}
      </p>
      <nav className="space-y-0.5" aria-label={title}>
        {items.map(({ to, label, icon: ItemIcon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={TAB_CLASS} title={label}>
            <ItemIcon className="h-[18px] w-[18px] shrink-0" />
            <span className={rail ? RAIL_LABEL : ''}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function SidebarContent({
  main,
  management,
  rail = false,
  onNavigate,
}: {
  main: NavItem[]
  management: NavItem[]
  rail?: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="mb-6 flex h-11 items-center gap-3 px-[19px] text-emerald-700 dark:text-emerald-500">
        <HeartLogo className="h-[18px] w-[18px] shrink-0" />
        <p className={`text-sm font-semibold text-neutral-900 dark:text-white ${rail ? RAIL_LABEL : ''}`}>
          Medi<span className="text-emerald-700 dark:text-emerald-500">Consultas</span>
        </p>
      </div>

      <NavSection title="Navegação" items={main} rail={rail} onNavigate={onNavigate} />
      <NavSection title="Gestão" items={management} rail={rail} onNavigate={onNavigate} />
    </>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const { main, management } = navForRole(user?.role)
  const zone = user ? ROLE_ZONE[user.role] : undefined
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Android back button closes the open menu instead of leaving the page.
  useEffect(() => {
    if (!mobileNavOpen) return
    function closeMenu(event: Event) {
      event.preventDefault()
      setMobileNavOpen(false)
    }
    window.addEventListener('androidback', closeMenu)
    return () => window.removeEventListener('androidback', closeMenu)
  }, [mobileNavOpen])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="group/rail fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col overflow-hidden border-r border-neutral-200 bg-white px-[7px] py-6 transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:w-60 hover:w-60 motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-900 lg:flex">
        <SidebarContent main={main} management={management} rail />
      </aside>

      <div
        className={`fixed inset-0 z-40 lg:hidden ${mobileNavOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileNavOpen}
      >
        <button
          type="button"
          aria-label="Fechar menu"
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-64 flex-col border-r border-neutral-200 bg-white px-[7px] pt-[calc(1.5rem+var(--safe-area-inset-top,0px))] pb-[calc(1.5rem+var(--safe-area-inset-bottom,0px))] transition-transform duration-300 dark:border-neutral-800 dark:bg-neutral-900 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute right-3 top-[calc(0.75rem+var(--safe-area-inset-top,0px))] rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <SidebarContent main={main} management={management} onNavigate={() => setMobileNavOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-neutral-50 lg:pl-[72px] dark:bg-neutral-950">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileNavOpen(true)}
              className="shrink-0 rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-neutral-400 dark:hover:bg-neutral-800 lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{zone}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/perfil"
              aria-label="Meu perfil"
              className="flex items-center gap-2 rounded-full transition hover:opacity-80 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                <UserIcon className="h-4 w-4" />
              </span>
              {user && (
                <span className="hidden pr-1 text-sm text-neutral-500 dark:text-neutral-400 md:inline">
                  {ROLE_LABELS[user.role]}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <LogOutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 p-4 sm:p-6">
          <InvitationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
