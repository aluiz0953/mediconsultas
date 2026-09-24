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

const NAV_ITEM_CLASS =
  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-100/70 transition-colors hover:bg-white/5 hover:text-white aria-[current=page]:bg-emerald-500 aria-[current=page]:text-white'

function NavSection({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  if (items.length === 0) return null
  return (
    <div className="mt-6">
      <p className="px-3 text-xs font-semibold tracking-widest text-emerald-100/60">{title}</p>
      <nav className="mt-2 space-y-0.5">
        {items.map(({ to, label, icon: ItemIcon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={NAV_ITEM_CLASS}>
            <ItemIcon className="h-4.5 w-4.5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function SidebarContent({ main, management, onNavigate }: { main: NavItem[]; management: NavItem[]; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <HeartLogo className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">
            Medi<span className="text-emerald-400">Consultas</span>
          </p>
          <p className="text-xs text-emerald-100/50">Cuidado conectado</p>
        </div>
      </div>

      <NavSection title="NAVEGAÇÃO" items={main} onNavigate={onNavigate} />
      <NavSection title="GESTÃO" items={management} onNavigate={onNavigate} />

      <div className="mt-auto flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3">
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div>
          <p className="text-xs font-medium text-emerald-100">Dados protegidos</p>
          <p className="text-xs text-emerald-100/50">Ambiente seguro e privado</p>
        </div>
      </div>
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
      <aside className="hidden w-64 shrink-0 flex-col bg-[#0b1710] px-4 py-6 lg:flex">
        <SidebarContent main={main} management={management} />
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
          className={`absolute inset-y-0 left-0 flex w-64 flex-col bg-[#0b1710] px-4 pt-[calc(1.5rem+var(--safe-area-inset-top,0px))] pb-[calc(1.5rem+var(--safe-area-inset-bottom,0px))] transition-transform duration-300 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute right-3 top-[calc(0.75rem+var(--safe-area-inset-top,0px))] rounded-md p-1.5 text-emerald-100/60 transition hover:bg-white/5 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <SidebarContent main={main} management={management} onNavigate={() => setMobileNavOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-neutral-50 dark:bg-neutral-950">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileNavOpen(true)}
              className="shrink-0 rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-neutral-400 dark:hover:bg-neutral-800 lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{zone}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/perfil"
              aria-label="Meu perfil"
              className="flex items-center gap-2 rounded-full transition hover:opacity-80 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <LogOutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <InvitationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
