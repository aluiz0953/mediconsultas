// Loading placeholders: the page keeps its final shape while data arrives, which
// reads as faster than a "Carregando…" line and avoids layout jumps.
export function SkeletonRows({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Carregando" aria-busy="true" className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="h-9 w-9 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-3/5 rounded bg-neutral-100 dark:bg-neutral-800/60" />
          </div>
        </div>
      ))}
    </div>
  )
}
