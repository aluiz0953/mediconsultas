import { LEGAL_UPDATED_AT } from '../lib/legal'
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from '../lib/legalDocuments'

// Typeset body of a legal document, shared by the public page and the dialog.
export function LegalContent({ doc }: { doc: LegalDocumentKey }) {
  const { title, intro, sections } = LEGAL_DOCUMENTS[doc]
  return (
    <article className="text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300 [&_li]:mt-1.5 [&_p+p]:mt-3 [&_p+ul]:mt-2 [&_strong]:font-semibold [&_strong]:text-neutral-900 dark:[&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ul+p]:mt-3">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">{title}</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Última atualização: {LEGAL_UPDATED_AT}</p>
      <div className="mt-5">{intro}</div>
      {sections.map((section) => (
        <section key={section.heading} className="mt-7">
          <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">{section.heading}</h2>
          {section.body}
        </section>
      ))}
    </article>
  )
}
