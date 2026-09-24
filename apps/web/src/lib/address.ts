export interface Address {
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
}

export const EMPTY_ADDRESS: Address = { cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }

// The API stores the address as one encrypted string; the structured fields
// travel inside it as JSON. Older free-text addresses load into "Rua".
export function parseAddress(value: string | null | undefined): Address {
  if (!value) return EMPTY_ADDRESS
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object') return { ...EMPTY_ADDRESS, ...parsed }
  } catch {
    // legacy plain-text address
  }
  return { ...EMPTY_ADDRESS, street: value }
}

export function serializeAddress(address: Address): string {
  return Object.values(address).some((field) => field.trim()) ? JSON.stringify(address) : ''
}
