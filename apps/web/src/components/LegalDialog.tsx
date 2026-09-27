import { useEffect, useRef } from 'react'
import { LegalContent } from './LegalContent'
import { XIcon } from './icons'
import type { LegalDocumentKey } from '../lib/legalDocuments'

// Reads a legal document without leaving the sign-up form (navigating away
// would lose what was typed, and in the Android app there is no new tab).
export function LegalDialog({ doc, onClose }: { doc: LegalDocumentKey | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (doc && !dialog.open) dialog.showModal()
    if (!doc && dialog.open) dialog.close()
  }, [doc])

  // The Android back button closes the dialog instead of leaving the page.
  useEffect(() => {
    if (!doc) return
    function closeOnBack(event: Event) {
      event.preventDefault()
      onClose()
    }
    window.addEventListener('androidback', closeOnBack)
    return () => window.removeEventListener('androidback', closeOnBack)
  }, [doc, onClose])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-auto max-h-[85svh] w-[min(40rem,calc(100vw-2rem))] rounded-xl bg-white p-0 shadow-xl backdrop:bg-black/40 dark:bg-neutral-900"
    >
      <div className="sticky top-0 flex justify-end bg-white/95 p-2 dark:bg-neutral-900/95">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="px-6 pb-8 sm:px-10">{doc && <LegalContent doc={doc} />}</div>
    </dialog>
  )
}
