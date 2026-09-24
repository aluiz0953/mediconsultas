import { useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

interface ClinicSettings {
  logo_base64: string | null
  logo_content_type: string | null
  updated_at: string | null
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg']

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // data:<type>;base64,<payload> — the API only wants the payload.
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ClinicSettingsPage() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<ClinicSettings>('/api/v1/clinic-settings')
      setSettings(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar configurações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('A logo deve ser PNG ou JPEG.')
      setStatus('error')
      return
    }

    setStatus('saving')
    setError('')
    try {
      const logo_base64 = await readFileAsBase64(file)
      const updated = await apiFetch<ClinicSettings>('/api/v1/clinic-settings/logo', {
        method: 'PUT',
        body: JSON.stringify({ logo_base64, content_type: file.type }),
      })
      setSettings(updated)
      setStatus('saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar a logo.')
      setStatus('error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader
        title="Configurações da clínica"
        subtitle="A logo enviada aqui aparece no cabeçalho dos PDFs de receita e prontuário."
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-medium text-neutral-900 dark:text-white">Logotipo</h2>

        {loading ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
        ) : (
          <>
            {settings?.logo_base64 ? (
              <img
                src={`data:${settings.logo_content_type};base64,${settings.logo_base64}`}
                alt="Logo atual da clínica"
                className="mt-4 h-24 w-24 rounded-md border border-neutral-200 object-contain dark:border-neutral-700"
              />
            ) : (
              <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Nenhuma logo configurada ainda.</p>
            )}

            <div className="mt-4">
              <label htmlFor="logo_file" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Enviar nova logo (PNG ou JPEG, até 2MB)
              </label>
              <input
                ref={fileInputRef}
                id="logo_file"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700 dark:text-neutral-300"
              />
            </div>

            {status === 'saving' && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Enviando…</p>}
            {status === 'error' && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {status === 'saved' && (
              <p role="status" className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                Logo atualizada.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
