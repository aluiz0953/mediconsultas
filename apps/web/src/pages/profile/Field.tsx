export interface FieldProps {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
  helpText?: string
}

export function Field({ label, id, value, onChange, type = 'text', autoComplete, required, helpText }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
      />
      {helpText && <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{helpText}</p>}
    </div>
  )
}
