import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute, PublicOnlyRoute, RequireRole } from './routes/guards'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { PendingDoctorsPage } from './pages/admin/PendingDoctorsPage'
import { AccountsPage } from './pages/admin/AccountsPage'
import { AuditLogPage } from './pages/admin/AuditLogPage'
import { SchedulePage } from './pages/secretary/SchedulePage'
import { QueuePage } from './pages/doctor/QueuePage'
import { ConsultationPage } from './pages/doctor/ConsultationPage'
import { AppointmentsPage } from './pages/patient/AppointmentsPage'
import { RecordsPage } from './pages/patient/RecordsPage'

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
            <Route path="/perfil" element={<ProfilePage />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin/doctors" element={<PendingDoctorsPage />} />
              <Route path="/admin/accounts" element={<AccountsPage />} />
              <Route path="/admin/audit" element={<AuditLogPage />} />
            </Route>

            <Route element={<RequireRole roles={['SECRETARY', 'ADMIN']} />}>
              <Route path="/secretary/schedule" element={<SchedulePage />} />
            </Route>

            <Route element={<RequireRole roles={['DOCTOR']} />}>
              <Route path="/doctor/queue" element={<QueuePage />} />
              <Route path="/doctor/appointments/:appointmentId" element={<ConsultationPage />} />
            </Route>

            <Route element={<RequireRole roles={['PATIENT']} />}>
              <Route path="/patient/appointments" element={<AppointmentsPage />} />
              <Route path="/patient/records" element={<RecordsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
