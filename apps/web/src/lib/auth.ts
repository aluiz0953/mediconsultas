const TOKEN_KEY = 'mediconsultas_access_token'

export type Role = 'ADMIN' | 'SECRETARY' | 'DOCTOR' | 'PATIENT'

interface JwtPayload {
  sub: string
  role: Role
  exp: number
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getCurrentUser(): JwtPayload | null {
  const token = getToken()
  if (!token) return null

  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as JwtPayload
    if (payload.exp * 1000 < Date.now()) {
      clearToken()
      return null
    }
    return payload
  } catch {
    return null
  }
}
