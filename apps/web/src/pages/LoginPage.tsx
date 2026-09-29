import { type FormEvent, lazy, Suspense, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiUrl } from '../lib/api'
import { setToken } from '../lib/auth'
import { getStoredTheme } from '../lib/theme'
import {
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricToken,
  hasBiometricLogin,
  isBiometricAvailable,
  isTokenExpired,
} from '../lib/biometric'
import { canRunHeavyEffects, whenIdle } from '../lib/performance'
import { ArrowRightIcon, EyeIcon, EyeOffIcon, FingerprintIcon, HeartLogo, LockIcon } from '../components/icons'

// three.js is ~900KB; lazy so it never blocks the login form's first paint.
const HeroGeometric = lazy(() => import('../components/HeroGeometric'))

// Emerald accent blending into the page background (matches bg-[#f1faf6] / dark:bg-[#0c1c16]).
const BACKGROUND = {
  light: { color1: '#4fd8a8', color2: '#f1faf6' },
  dark: { color1: '#0d9f75', color2: '#0c1c16' },
}

interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface ApiError {
  code: string
  message: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const justRegistered = (location.state as { justRegistered?: 'patient' | 'doctor' } | null)?.justRegistered
  // Decorative WebGL background: capable desktops only, and only after first paint.
  const [showHero, setShowHero] = useState(false)
  useEffect(() => (canRunHeavyEffects() ? whenIdle(() => setShowHero(true)) : undefined), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricSaved, setBiometricSaved] = useState(false)
  const [useBiometric, setUseBiometric] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable)
    hasBiometricLogin().then(setBiometricSaved)
  }, [])

  async function handleBiometricLogin() {
    setErrorMessage('')
    try {
      const token = await getBiometricToken()
      if (isTokenExpired(token)) {
        await disableBiometricLogin()
        setBiometricSaved(false)
        setErrorMessage('Sua entrada por biometria expirou. Entre com a senha e ative de novo.')
        setStatus('error')
        return
      }
      setToken(token)
      navigate('/', { replace: true })
    } catch {
      // Cancelled or not recognized: the password form stays available.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const response = await fetch(apiUrl('/api/v1/auth/login'), {
        method: 'POST',
        // Lets the admin's audit log tell web logins from Android-app logins.
        headers: { 'content-type': 'application/json', 'x-client-platform': Capacitor.getPlatform() },
        // Biometric login reuses this session, so it gets the long-lived one.
        body: JSON.stringify({ email, password, remember_me: rememberMe || useBiometric }),
      })

      if (!response.ok) {
        const body = (await response.json()) as ApiError
        setErrorMessage(body.message)
        setStatus('error')
        return
      }

      const body = (await response.json()) as LoginResponse
      setToken(body.access_token)
      if (useBiometric) await enableBiometricLogin(email, body.access_token).catch(() => {})
      setStatus('success')
      navigate('/', { replace: true })
    } catch {
      setErrorMessage('Não foi possível conectar à API. Ela está rodando em localhost:8000?')
      setStatus('error')
    }
  }

  return (
    <main
      style={{ fontFamily: "'DM Sans Variable', sans-serif" }}
      className="relative isolate grid min-h-svh place-items-center overflow-hidden bg-[#f1faf6] p-5 text-[#173d30] sm:p-8 lg:p-14 dark:bg-[#0c1c16] dark:text-[#e6f8ef]"
    >
      {showHero && (
        <Suspense fallback={null}>
          <HeroGeometric {...BACKGROUND[getStoredTheme()]} speed={4} className="-z-20" />
        </Suspense>
      )}
      <div
        aria-hidden="true"
        className="login-orb-one pointer-events-none absolute -top-44 right-[10%] -z-10 h-[430px] w-[430px] rounded-full bg-emerald-500/15 blur-[1px] dark:bg-emerald-500/10"
      />
      <div
        aria-hidden="true"
        className="login-orb-two pointer-events-none absolute -bottom-56 left-[15%] -z-10 h-[510px] w-[510px] rounded-full bg-emerald-300/15 blur-[1px] dark:bg-emerald-300/10"
      />

      <div className="relative z-10 grid w-full max-w-[1080px] items-center gap-10 lg:grid-cols-[minmax(320px,0.92fr)_minmax(370px,440px)] lg:gap-24">
        <section className="flex min-h-[auto] flex-col justify-between py-1 lg:min-h-[590px] lg:py-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[11px] bg-emerald-500 text-white shadow-[0_7px_18px_rgba(25,168,151,0.24)]">
                <HeartLogo className="h-4.5 w-4.5" />
              </span>
              <div>
                <strong className="block text-lg leading-none font-bold tracking-tight text-[#183e31] dark:text-[#e6f8ef]">
                  Medi<span className="text-[#0d9f75] dark:text-[#4fd8a8]">Consultas</span>
                </strong>
                <small className="mt-1 block text-xs text-[#5f8375] dark:text-[#8eaf9f]">Cuidado conectado</small>
              </div>
            </div>

            <div className="mt-8 max-w-[480px] lg:mt-10">
              <h1 className="text-[clamp(30px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.025em] text-[#173d30] dark:text-[#e6f8ef]">
                Saúde organizada,
                <br />
                <span className="text-[#0d9f75] dark:text-[#4fd8a8]">tranquilidade</span> para você.
              </h1>
              <p className="mt-4 max-w-[375px] text-base leading-relaxed text-[#4f7263] dark:text-[#9dc1b1]">
                Uma experiência simples para acompanhar consultas, documentos e tudo o que importa no seu cuidado.
              </p>
            </div>
          </div>

          <p className="mt-10 hidden text-xs text-[#5f8375] lg:block dark:text-[#8eaf9f]">© 2026 MediConsultas</p>
        </section>

        <section className="login-card-enter w-full rounded-xl border border-emerald-100 bg-white p-7 shadow-[0_8px_24px_rgba(32,111,84,0.08)] sm:p-9 dark:border-emerald-900/60 dark:bg-[#112b21] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#173d30] dark:text-[#e6f8ef]">Bem-vindo de volta</h2>
          <p className="mt-1 text-sm text-[#4f7263] dark:text-[#9dc1b1]">Entre na sua conta para continuar.</p>

          {justRegistered && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-[#b9ead8] bg-[#effbf5] px-3 py-2.5 text-sm leading-relaxed text-[#2b8067] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {justRegistered === 'doctor'
                ? 'Cadastro enviado. Você poderá entrar assim que a administração aprovar seu CRM.'
                : 'Conta criada com sucesso. Entre com seu e-mail e senha.'}
            </p>
          )}

          {biometricSaved && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <FingerprintIcon className="h-5 w-5" aria-hidden="true" />
              Entrar com digital ou rosto
            </button>
          )}

          <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm font-semibold text-[#3d6153] dark:text-[#b4d7c7]">
              E-mail
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#d5ebe1] bg-[#fbfefc] px-3 text-base font-normal text-[#294d3f] outline-none transition placeholder:text-[#5f8375] focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/15 dark:border-emerald-800 dark:bg-[#10261e] dark:text-[#dcf4e8] dark:placeholder:text-[#739b88]"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-[#3d6153] dark:text-[#b4d7c7]">
              Senha
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[#d5ebe1] bg-[#fbfefc] px-3 pr-9 text-base font-normal text-[#294d3f] outline-none transition placeholder:text-[#5f8375] focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/15 dark:border-emerald-800 dark:bg-[#10261e] dark:text-[#dcf4e8] dark:placeholder:text-[#739b88]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[#86a397] transition hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:text-emerald-400"
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <div className="-mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-[#4f7263] dark:text-[#9cc4b2]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-500"
                />
                Manter conectado
              </label>
              {biometricAvailable && !biometricSaved && (
                <label className="inline-flex basis-full items-center gap-1.5 text-sm text-[#4f7263] dark:text-[#9cc4b2]">
                  <input
                    type="checkbox"
                    checked={useBiometric}
                    onChange={(event) => setUseBiometric(event.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-500"
                  />
                  Entrar com digital ou rosto nas próximas vezes
                </label>
              )}
              <Link
                to="/forgot-password"
                className="whitespace-nowrap text-sm font-semibold text-[#087f61] hover:text-[#066b52] hover:underline dark:text-[#4fd8a8]"
              >
                Esqueci minha senha
              </Link>
            </div>

            {status === 'error' && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
              >
                {errorMessage}
              </p>
            )}

            {status === 'success' && (
              <p className="rounded-lg border border-[#b9ead8] bg-[#effbf5] px-3 py-2.5 text-sm leading-relaxed text-[#2b8067] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Login realizado com sucesso.
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="mt-1 flex min-h-12 w-full items-center justify-between rounded-[10px] bg-emerald-600 px-4.5 pr-4 text-sm font-semibold text-white shadow-[0_9px_18px_rgba(24,196,147,0.2)] transition hover:bg-emerald-700 hover:shadow-[0_11px_22px_rgba(24,196,147,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-emerald-500"
            >
              {status === 'loading' ? 'Entrando…' : 'Entrar na minha conta'}
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-balance text-[#4f7263] dark:text-[#9bbbae]">
            Ainda não tem uma conta?{' '}
            <Link to="/register" className="font-semibold text-[#087f61] hover:text-[#066b52] hover:underline dark:text-[#4fd8a8]">
              Cadastre-se como paciente
            </Link>{' '}
            ou{' '}
            <Link to="/register?tipo=medico" className="font-semibold text-[#087f61] hover:text-[#066b52] hover:underline dark:text-[#4fd8a8]">
              como médico
            </Link>
          </p>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <LockIcon className="h-3.5 w-3.5" />
            Ambiente privado e protegido
          </p>

          <nav aria-label="Documentos legais" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[#5f8375] dark:text-[#8eaf9f]">
            <Link to="/termos" className="hover:underline">Termos de Uso</Link>
            <Link to="/privacidade" className="hover:underline">Privacidade</Link>
            <Link to="/direitos-autorais" className="hover:underline">Direitos autorais</Link>
          </nav>
        </section>
      </div>
    </main>
  )
}
