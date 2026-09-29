import { Capacitor } from '@capacitor/core'

interface NavigatorHints extends Navigator {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

// Heavy decorative effects (WebGL backgrounds) only on capable desktop browsers:
// never in the native app or on phones, and never when the person asked for
// less motion / data saving or the device reports little memory or few cores.
export function canRunHeavyEffects(): boolean {
  if (Capacitor.isNativePlatform()) return false
  const nav = navigator as NavigatorHints
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (nav.connection?.saveData) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false
  if ((nav.hardwareConcurrency ?? 8) < 4) return false
  return window.matchMedia('(min-width: 768px)').matches
}

// Runs after first paint so the form is interactive before any optional work.
// (requestIdleCallback is missing in older WebViews and Safari.)
export function whenIdle(callback: () => void): () => void {
  const idle = window as Partial<Window>
  const request = idle.requestIdleCallback
  const cancel = idle.cancelIdleCallback
  if (request && cancel) {
    const id = request.call(window, callback, { timeout: 1500 })
    return () => cancel.call(window, id)
  }
  const id = setTimeout(callback, 300)
  return () => clearTimeout(id)
}
