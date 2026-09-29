import type { ReactNode } from 'react'
import { getCurrentUser, type Role } from '../lib/auth'
import { AdminDashboard } from './home/AdminDashboard'
import { DoctorDashboard } from './home/DoctorDashboard'
import { PatientDashboard } from './home/PatientDashboard'
import { SecretaryDashboard } from './home/SecretaryDashboard'

// ---------------------------------------------------------------------------
// Home per role
// ---------------------------------------------------------------------------

const DASHBOARD: Record<Role, () => ReactNode> = {
  ADMIN: AdminDashboard,
  SECRETARY: SecretaryDashboard,
  DOCTOR: DoctorDashboard,
  PATIENT: PatientDashboard,
}

export function HomePage() {
  const user = getCurrentUser()
  if (!user) return null
  const Dashboard = DASHBOARD[user.role]
  return <Dashboard />
}
