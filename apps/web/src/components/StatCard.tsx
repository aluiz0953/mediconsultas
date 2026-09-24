import type { ComponentType, SVGProps } from 'react'

interface StatCardProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  value: string | number
}

export function StatCard({ icon: StatIcon, label, value }: StatCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
        <StatIcon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
        <p className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}
