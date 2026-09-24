import { useEffect, useState } from 'react'
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <button
      type="button"
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      aria-label="Alternar tema"
    >
      {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    </button>
  )
}
