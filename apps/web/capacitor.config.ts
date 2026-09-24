import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mediconsultas.app',
  appName: 'MediConsultas',
  webDir: 'dist-android',
  server: {
    // http (not the https default) so the WebView may call the API over plain
    // http on the LAN without mixed-content blocking. Origin becomes http://localhost,
    // which is what the API's CORS_ORIGINS must allow.
    // ponytail: fine for LAN/dev; switch back to https once the API has TLS.
    androidScheme: 'http',
  },
}

export default config
