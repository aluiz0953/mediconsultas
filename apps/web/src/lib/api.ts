import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { clearToken, getToken } from './auth'

// Empty on the web (relative paths go through the Vite proxy). The Android build sets
// VITE_API_URL to an absolute API origin, since the app has no proxy.
export function apiUrl(path: string): string {
  return `${import.meta.env.VITE_API_URL ?? ''}${path}`
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (response.status === 401) {
    clearToken()
    window.location.assign('/login')
    throw new ApiError(401, 'Sessão expirada.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Erro inesperado.' }))
    throw new ApiError(response.status, body.message ?? 'Erro inesperado.')
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

// Live agenda/queue updates. EventSource can't send headers, so each connection
// carries a 30 s single-purpose ticket in its URL (never the session token).
// After a drop the browser would retry the same URL with a stale ticket, so on
// error we close and reconnect with a fresh one.
export function subscribeAppointmentEvents(onChange: () => void): () => void {
  if (!getToken()) return () => {}
  let source: EventSource | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  function retry() {
    if (!closed) timer = setTimeout(connect, 3000)
  }

  async function connect() {
    try {
      const { ticket } = await apiFetch<{ ticket: string }>('/api/v1/appointments/events/ticket', { method: 'POST' })
      if (closed) return
      source = new EventSource(apiUrl(`/api/v1/appointments/events?ticket=${encodeURIComponent(ticket)}`))
      source.onmessage = onChange
      source.onerror = () => {
        source?.close()
        source = null
        retry()
      }
    } catch {
      retry()
    }
  }

  connect()
  return () => {
    closed = true
    clearTimeout(timer)
    source?.close()
  }
}

// RF-09: PDF endpoints need the same Bearer auth as apiFetch, so a plain
// <a href> won't work — fetch as a blob and open that instead.
export async function openPdf(path: string): Promise<void> {
  const token = getToken()
  const response = await fetch(apiUrl(path), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new ApiError(response.status, 'Falha ao gerar o PDF.')
  }

  const blob = await response.blob()
  if (Capacitor.isNativePlatform()) {
    return shareNativeFile(blob, path.includes('prescriptions') ? 'receita.pdf' : 'registro-clinico.pdf')
  }
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

// The Android WebView can't open a blob: URL in a new tab or honor <a download>,
// so on the app the file is saved to cache and handed to the system share sheet
// (PDF viewer, WhatsApp, Drive...).
async function shareNativeFile(blob: Blob, filename: string): Promise<void> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
  await Share.share({ title: filename, files: [uri] })
}

// ADM-08: same Bearer-auth constraint as openPdf, but this one should save
// to disk (compliance export) instead of opening in a tab.
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken()
  const response = await fetch(apiUrl(path), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Falha ao exportar o arquivo.' }))
    throw new ApiError(response.status, body.message ?? 'Falha ao exportar o arquivo.')
  }

  const blob = await response.blob()
  if (Capacitor.isNativePlatform()) return shareNativeFile(blob, filename)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
