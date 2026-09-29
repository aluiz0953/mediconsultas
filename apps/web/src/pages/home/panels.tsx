import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../../components/StatusBadge'
import { ArrowRightIcon, CheckCircleIcon } from '../../components/icons'
import type { Notice } from './format'

const NOTICE_TONE = {
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

export function ErrorLine({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}

export function NoticeList({ notices, loading }: { notices: Notice[]; loading: boolean }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-100 px-5 py-4 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
        Avisos
      </h2>
      {loading ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : notices.length === 0 ? (
        <p className="flex items-center gap-2 p-5 text-sm text-neutral-600 dark:text-neutral-300">
          <CheckCircleIcon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Tudo em dia. Nenhuma ação pendente.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {notices.map((notice) => (
            <li key={notice.to + notice.title + notice.detail}>
              <Link
                to={notice.to}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none dark:hover:bg-neutral-800/50 dark:focus-visible:bg-neutral-800/50"
              >
                <span
                  className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums ${NOTICE_TONE[notice.tone]}`}
                >
                  {notice.count ?? <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-neutral-900 dark:text-white">{notice.title}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">{notice.detail}</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AppointmentPanel({
  title,
  to,
  loading,
  empty,
  children,
  scrollable,
}: {
  scrollable?: boolean
  title: string
  to?: string
  loading: boolean
  empty: string
  children: ReactNode[]
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h2>
        {to && (
          <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Ver tudo
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {loading ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
      ) : children.length === 0 ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-400">{empty}</p>
      ) : (
        <ul className={`divide-y divide-neutral-100 dark:divide-neutral-800 ${scrollable ? 'max-h-80 overflow-y-auto' : ''}`}>{children}</ul>
      )}
    </section>
  )
}

export function AppointmentRow({ primary, secondary, status }: { primary: string; secondary: string; status: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{primary}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{secondary}</p>
      </div>
      <StatusBadge status={status} />
    </li>
  )
}

export const PRIMARY_LINK_CLASS =
  'rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2'
