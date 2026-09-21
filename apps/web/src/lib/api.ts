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
