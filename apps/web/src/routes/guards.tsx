import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { getCurrentUser, type Role } from '../lib/auth'

export function ProtectedRoute() {
  const user = getCurrentUser()
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const user = getCurrentUser()
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Outlet />
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const user = getCurrentUser()
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}
