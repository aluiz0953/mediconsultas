import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute, PublicOnlyRoute, RequireRole } from './routes/guards'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { HomePage } from './pages/HomePage'
import { applyTheme, getStoredTheme } from './lib/theme'

// Role-scoped pages are lazy: a given user only ever loads the 1-3 chunks
// their own role needs, instead of every role's code landing in one bundle.
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const PendingDoctorsPage = lazy(() =>
  import('./pages/admin/PendingDoctorsPage').then((m) => ({ default: m.PendingDoctorsPage })),
)
const AccountsPage = lazy(() => import('./pages/admin/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const SchedulePage = lazy(() => import('./pages/secretary/SchedulePage').then((m) => ({ default: m.SchedulePage })))
const ClinicSettingsPage = lazy(() =>
  import('./pages/secretary/ClinicSettingsPage').then((m) => ({ default: m.ClinicSettingsPage })),
)
const QueuePage = lazy(() => import('./pages/doctor/QueuePage').then((m) => ({ default: m.QueuePage })))
const ConsultationPage = lazy(() =>
  import('./pages/doctor/ConsultationPage').then((m) => ({ default: m.ConsultationPage })),
)
const AppointmentsPage = lazy(() =>
  import('./pages/patient/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })),
)
const RecordsPage = lazy(() => import('./pages/patient/RecordsPage').then((m) => ({ default: m.RecordsPage })))

function PageFallback() {
  return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
}

function App() {
  // The toggle itself only lives on the profile page, but the chosen theme
  // (light by default — see lib/theme.ts) must still apply on every route.
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

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
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPasswordPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicOnlyRoute>
              <ResetPasswordPage />
            </PublicOnlyRoute>
          }
        />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/perfil"
              element={
                <Suspense fallback={<PageFallback />}>
                  <ProfilePage />
                </Suspense>
              }
            />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route
                path="/admin/doctors"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <PendingDoctorsPage />
                  </Suspense>
                }
              />
              <Route
                path="/admin/accounts"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <AccountsPage />
                  </Suspense>
                }
              />
              <Route
                path="/admin/audit"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <AuditLogPage />
                  </Suspense>
                }
              />
            </Route>

            <Route element={<RequireRole roles={['SECRETARY', 'ADMIN']} />}>
              <Route
                path="/secretary/schedule"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <SchedulePage />
                  </Suspense>
                }
              />
              <Route
                path="/secretary/clinic-settings"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <ClinicSettingsPage />
                  </Suspense>
                }
              />
            </Route>

            <Route element={<RequireRole roles={['DOCTOR']} />}>
              <Route
                path="/doctor/queue"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <QueuePage />
                  </Suspense>
                }
              />
              <Route
                path="/doctor/appointments/:appointmentId"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <ConsultationPage />
                  </Suspense>
                }
              />
            </Route>

            <Route element={<RequireRole roles={['PATIENT']} />}>
              <Route
                path="/patient/appointments"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <AppointmentsPage />
                  </Suspense>
                }
              />
              <Route
                path="/patient/records"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <RecordsPage />
                  </Suspense>
                }
              />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
