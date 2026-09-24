import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useLocation, useNavigate } from 'react-router-dom'

// Screens where the hardware back button leaves the app instead of navigating.
const ROOT_PATHS = new Set(['/', '/login'])

// Android hardware back button. Open overlays (e.g. the mobile menu) get the
// first chance: they listen for the cancelable `androidback` window event and
// call preventDefault() to consume it.
export function AndroidBackButton() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    const listener = App.addListener('backButton', ({ canGoBack }) => {
      if (!window.dispatchEvent(new Event('androidback', { cancelable: true }))) return
      if (ROOT_PATHS.has(pathnameRef.current)) App.minimizeApp()
      else if (canGoBack) window.history.back()
      else navigate('/', { replace: true })
    })
    return () => {
      listener.then((handle) => handle.remove())
    }
  }, [navigate])

  return null
}
