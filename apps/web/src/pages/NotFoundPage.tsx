import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HeartLogo } from '../components/icons'
import { canRunHeavyEffects, whenIdle } from '../lib/performance'

const FluidOrb = lazy(() => import('../components/ui/fluid-orb'))

// Any address the router does not know (signed in or not). The "0" of 404 is the animated
// orb when the device can afford it, and a plain "0" otherwise.
export function NotFoundPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [showOrb, setShowOrb] = useState(false)
  const canGoBack = (window.history.state?.idx ?? 0) > 0

  useEffect(() => {
    const previous = document.title
    document.title = 'Página não encontrada · MediConsultas'
    return () => {
      document.title = previous
    }
  }, [])
  useEffect(() => (canRunHeavyEffects() ? whenIdle(() => setShowOrb(true)) : undefined), [])

  return (
    <main className="flex min-h-svh flex-col bg-neutral-50 px-6 py-6 dark:bg-neutral-950">
      <Link to="/" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <HeartLogo className="h-4 w-4" />
        </span>
        MediConsultas
      </Link>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center py-12 text-center">
        <p aria-hidden="true" className="flex items-center gap-2 font-sans text-[8rem] font-semibold leading-none tracking-tighter text-emerald-600 dark:text-emerald-400">
          <span>4</span>
          {showOrb ? (
            <Suspense fallback={<span>0</span>}>
              <span className="translate-y-[0.2em]"><FluidOrb size={96} color="#10b981" /></span>
            </Suspense>
          ) : (
            <span>0</span>
          )}
          <span>4</span>
        </p>

        <h1 className="mt-6 text-2xl font-semibold text-neutral-900 dark:text-white">Página não encontrada</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          O endereço que você abriu não existe ou foi movido. Confira se ele está certo ou volte para o início.
        </p>
        <p className="mt-4 max-w-full break-all rounded-md bg-neutral-100 px-3 py-1.5 font-mono text-xs text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          {pathname}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Ir para o início
          </Link>
          {canGoBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Voltar
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">Cuidado conectado</p>
    </main>
  )
}
