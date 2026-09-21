import { clearToken, getToken } from './auth'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(path, {
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

// RF-09: PDF endpoints need the same Bearer auth as apiFetch, so a plain
// <a href> won't work — fetch as a blob and open that instead.
export async function openPdf(path: string): Promise<void> {
  const token = getToken()
  const response = await fetch(path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new ApiError(response.status, 'Falha ao gerar o PDF.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
