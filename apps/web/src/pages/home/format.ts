import { ApiError } from '../../lib/api'
import { parseAddress } from '../../lib/address'

export interface Appointment {
  id: string
  patient?: { display_name: string }
  doctor?: { display_name: string }
  starts_at: string
  ends_at: string
  status: string
}

export interface RoleProfile {
  full_name: string
  phone: string | null
  address: string | null
  approval_status?: string
}

export interface Notice {
  to: string
  title: string
  detail: string
  tone: 'amber' | 'red' | 'emerald'
  count?: number
}

export const DAY_MS = 24 * 60 * 60 * 1000
export const ACTIVE_STATUSES = new Set(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'])

export function isoDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDayTime(iso: string): string {
  const date = new Date(iso)
  const day =
    date.toDateString() === new Date().toDateString()
      ? 'Hoje'
      : date.toDateString() === new Date(Date.now() + DAY_MS).toDateString()
        ? 'Amanhã'
        : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return `${day} às ${formatTime(iso)}`
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

// What's missing from the person's own profile, in plain words (empty = complete).
export function missingProfileData(profile: RoleProfile | null): string[] {
  if (!profile) return []
  const missing: string[] = []
  if (!profile.phone?.trim()) missing.push('telefone')
  const address = parseAddress(profile.address)
  if (!address.cep || !address.number) missing.push('endereço com CEP e número')
  return missing
}

export function firstName(fullName: string | undefined): string {
  // Skips titles so "Dra. Ana Souza" greets as "Ana".
  return fullName?.trim().split(/\s+/).find((word) => !/^dra?\.?$/i.test(word)) ?? ''
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}
