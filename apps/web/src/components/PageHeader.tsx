import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-md text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
