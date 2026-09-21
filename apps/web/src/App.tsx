import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute, PublicOnlyRoute, RequireRole } from './routes/guards'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { PendingDoctorsPage } from './pages/admin/PendingDoctorsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin/doctors" element={<PendingDoctorsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
