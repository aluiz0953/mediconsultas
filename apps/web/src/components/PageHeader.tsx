import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-prose text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
