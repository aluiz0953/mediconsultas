import { getCurrentUser } from '../lib/auth'

export function HomePage() {
  const user = getCurrentUser()

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Bem-vindo(a)</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Perfil: {user?.role ?? 'desconhecido'}
      </p>
    </div>
  )
}
