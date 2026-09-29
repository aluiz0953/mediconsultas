import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts ship inside the app (no Google Fonts request on start, works offline).
import '@fontsource-variable/outfit/wght.css'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/dm-sans/wght.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
