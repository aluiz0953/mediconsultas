import { Capacitor } from '@capacitor/core'
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'

// Fingerprint/face login on the Android app. The session token (never the
// password) is kept in the Android Keystore behind a biometric-bound key.
// ponytail: reuses the 30-day "remember me" JWT, so biometric login lapses when
// it expires and the password is needed once more; a per-device refresh
// credential on the API would remove that ceiling.
const SERVER = 'com.mediconsultas.app'

export async function isBiometricAvailable(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false
  try {
    return (await NativeBiometric.isAvailable({ useFallback: false })).isAvailable
  } catch {
    return false
  }
}

export async function hasBiometricLogin(): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false
  try {
    return (await NativeBiometric.isCredentialsSaved({ server: SERVER })).isSaved
  } catch {
    return false
  }
}

export function enableBiometricLogin(email: string, token: string): Promise<void> {
  return NativeBiometric.setCredentials({
    username: email,
    password: token,
    server: SERVER,
    accessControl: AccessControl.BIOMETRY_ANY,
    title: 'Ativar entrada com biometria',
    negativeButtonText: 'Agora não',
  })
}

export async function getBiometricToken(): Promise<string> {
  const credentials = await NativeBiometric.getSecureCredentials({
    server: SERVER,
    title: 'Entrar no MediConsultas',
    subtitle: 'Use sua digital ou reconhecimento facial',
    negativeButtonText: 'Usar senha',
  })
  return credentials.password
}

export async function disableBiometricLogin(): Promise<void> {
  await NativeBiometric.deleteCredentials({ server: SERVER }).catch(() => {})
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}
