import { Link } from 'react-router-dom'
import { LegalContent } from '../components/LegalContent'
import { HeartLogo } from '../components/icons'
import type { LegalDocumentKey } from '../lib/legalDocuments'

const OTHER_LINKS: { doc: LegalDocumentKey; label: string }[] = [
  { doc: 'termos', label: 'Termos de Uso' },
  { doc: 'privacidade', label: 'Política de Privacidade' },
  { doc: 'direitos-autorais', label: 'Direitos Autorais' },
]

// Public, readable by anyone (signed in or not): /termos, /privacidade, /direitos-autorais.
export function LegalPage({ doc }: { doc: LegalDocumentKey }) {
  return (
    <div className="min-h-svh bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <HeartLogo className="h-4 w-4" />
          </span>
          MediConsultas
        </Link>

        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 sm:p-10 dark:border-neutral-800 dark:bg-neutral-900">
          <LegalContent doc={doc} />
        </div>

        <nav aria-label="Documentos legais" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {OTHER_LINKS.filter((link) => link.doc !== doc).map((link) => (
            <Link key={link.doc} to={`/${link.doc}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
