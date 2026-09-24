import { useRef, useState } from 'react'
import type { Address } from '../lib/address'

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white'
const LABEL_CLASS = 'block text-sm font-medium text-neutral-700 dark:text-neutral-300'

export function AddressFields({
  value,
  onChange,
  required,
}: {
  value: Address
  onChange: (address: Address) => void
  required?: boolean
}) {
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'not_found' | 'error'>('idle')
  const numberRef = useRef<HTMLInputElement>(null)
  const set = (key: keyof Address) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: event.target.value })

  async function handleCep(event: React.ChangeEvent<HTMLInputElement>) {
    const cep = formatCep(event.target.value)
    const next = { ...value, cep }
    onChange(next)
    const digits = cep.replace('-', '')
    if (digits.length !== 8) {
      setLookup('idle')
      return
    }
    setLookup('loading')
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await response.json()
      if (!response.ok || data.erro) {
        setLookup('not_found')
        return
      }
      onChange({
        ...next,
        street: data.logradouro || next.street,
        neighborhood: data.bairro || next.neighborhood,
        city: data.localidade || next.city,
        state: data.uf || next.state,
      })
      setLookup('idle')
      numberRef.current?.focus()
    } catch {
      setLookup('error')
    }
  }

  const hint = {
    idle: 'Rua, bairro e cidade são preenchidos pelo CEP.',
    loading: 'Buscando endereço…',
    not_found: 'CEP não encontrado. Preencha o endereço manualmente.',
    error: 'Não foi possível buscar o CEP agora. Preencha manualmente.',
  }[lookup]

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-neutral-900 dark:text-white">Endereço</legend>
      <div>
        <label htmlFor="address_cep" className={LABEL_CLASS}>
          CEP
        </label>
        <input
          id="address_cep"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          required={required}
          value={value.cep}
          onChange={handleCep}
          className={`${INPUT_CLASS} max-w-40`}
        />
        <p className={`mt-1 text-xs ${lookup === 'idle' || lookup === 'loading' ? 'text-neutral-400 dark:text-neutral-500' : 'text-amber-700 dark:text-amber-400'}`}>
          {hint}
        </p>
      </div>
      <div>
        <label htmlFor="address_street" className={LABEL_CLASS}>
          Rua
        </label>
        <input id="address_street" autoComplete="address-line1" required={required} value={value.street} onChange={set('street')} className={INPUT_CLASS} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
        <div>
          <label htmlFor="address_number" className={LABEL_CLASS}>
            Número
          </label>
          <input id="address_number" ref={numberRef} required={required} value={value.number} onChange={set('number')} className={`${INPUT_CLASS} max-w-40 sm:max-w-none`} />
        </div>
        <div>
          <label htmlFor="address_complement" className={LABEL_CLASS}>
            Complemento
          </label>
          <input
            id="address_complement"
            autoComplete="address-line2"
            placeholder="Apto, bloco, ponto de referência"
            value={value.complement}
            onChange={set('complement')}
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div>
        <label htmlFor="address_neighborhood" className={LABEL_CLASS}>
          Bairro
        </label>
        <input id="address_neighborhood" required={required} value={value.neighborhood} onChange={set('neighborhood')} className={INPUT_CLASS} />
      </div>
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <div>
          <label htmlFor="address_city" className={LABEL_CLASS}>
            Cidade
          </label>
          <input id="address_city" autoComplete="address-level2" required={required} value={value.city} onChange={set('city')} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="address_state" className={LABEL_CLASS}>
            UF
          </label>
          <input
            id="address_state"
            autoComplete="address-level1"
            maxLength={2}
            required={required}
            value={value.state}
            onChange={(event) => onChange({ ...value, state: event.target.value.toUpperCase() })}
            className={INPUT_CLASS}
          />
        </div>
      </div>
    </fieldset>
  )
}
