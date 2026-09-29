import { useState, type ComponentProps } from 'react'
import { Capacitor } from '@capacitor/core'
import { SlideConfirm } from './SlideConfirm'

type Props = ComponentProps<typeof SlideConfirm> & { buttonLabel: string }

// The Android app keeps the slide-to-confirm gesture; in the browser it is a plain button.
export function ConfirmAction({ buttonLabel, ...slide }: Props) {
  const [busy, setBusy] = useState(false)
  if (Capacitor.isNativePlatform()) return <SlideConfirm {...slide} />

  async function run() {
    setBusy(true)
    try {
      await slide.onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={slide.disabled || busy}
      onClick={run}
      className={`rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${slide.className ?? ''}`}
    >
      {busy ? (slide.busyLabel ?? 'Confirmando…') : buttonLabel}
    </button>
  )
}
