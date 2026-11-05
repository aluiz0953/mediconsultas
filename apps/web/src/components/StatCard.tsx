import type { ComponentType, SVGProps } from 'react'

interface StatCardProps {
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  value: string | number
}

// A labelled field on the ficha: small label above, the figure below. The icon is accepted for compatibility but not drawn.
export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="border-t-2 border-neutral-300 pt-2 dark:border-neutral-700">
      <p className="text-[11px] font-medium uppercase leading-tight tracking-wider text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-white">{value}</p>
    </div>
  )
}
