import 'dotenv/config';
// Must load before any router: patches express.Router so a rejected promise
// inside an async handler reaches the error middleware instead of crashing
// the process (Express 4 doesn't do this on its own; Express 5 would).
import 'express-async-errors';
import express from 'express';
import { pool } from './db.js';
import { requireAuth, requireAuthFromHeaderOrQuery, requireRole } from './auth/middleware.js';
import { authRouter } from './routes/auth.js';
import { accountRouter } from './routes/account.js';
import { patientsRouter } from './routes/patients.js';
import { patientProfileRouter } from './routes/patient-profile.js';
import { doctorsRouter } from './routes/doctors.js';
import { doctorProfileRouter } from './routes/doctor-profile.js';
import { adminDoctorsRouter } from './routes/admin-doctors.js';
import { adminAccountsRouter } from './routes/admin-accounts.js';
import { adminAuditRouter } from './routes/admin-audit.js';
import { secretaryAppointmentsRouter } from './routes/secretary-appointments.js';
import { secretaryScheduleBlocksRouter } from './routes/secretary-schedule-blocks.js';
import { doctorAppointmentsRouter } from './routes/doctor-appointments.js';
import { appointmentEventsRouter } from './routes/appointment-events-sse.js';
import { clinicalRecordsRouter } from './routes/clinical-records.js';
import { prescriptionsRouter } from './routes/prescriptions.js';
import { clinicSettingsRouter } from './routes/clinic-settings.js';
import { patientClinicalRecordsRouter } from './routes/patient-clinical-records.js';
import { patientPrescriptionsRouter } from './routes/patient-prescriptions.js';
import { patientAppointmentsRouter } from './routes/patient-appointments.js';
import { PgPatientRepository } from './repositories/patient-repository.js';
import { PgDoctorRepository } from './repositories/doctor-repository.js';
import { PgAppointmentRepository } from './repositories/appointment-repository.js';
import { PgClinicalRecordRepository } from './repositories/clinical-record-repository.js';
import { PgPrescriptionRepository } from './repositories/prescription-repository.js';
import { PgAuditEventRepository } from './repositories/audit-event-repository.js';
import { PgAccountRepository } from './repositories/account-repository.js';
import { PgPasswordResetRepository } from './repositories/password-reset-repository.js';
import { PgDoctorScheduleBlockRepository } from './repositories/doctor-schedule-block-repository.js';
import { PgClinicSettingsRepository } from './repositories/clinic-settings-repository.js';
import { consoleMailer } from './notifications/mailer.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} env var is required`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const CPF_HMAC_SECRET = requireEnv('CPF_HMAC_SECRET');
const LICENSE_HMAC_SECRET = requireEnv('LICENSE_HMAC_SECRET');
const FIELD_ENCRYPTION_KEY = requireEnv('FIELD_ENCRYPTION_KEY');
const RESET_TOKEN_HMAC_SECRET = requireEnv('RESET_TOKEN_HMAC_SECRET');

const app = express();
// Default 100kb is too small for a base64-encoded clinic logo (up to 2MB
// decoded, enforced in clinic-settings.ts) — raised app-wide rather than
// re-parsing the body per route, since a second express.json() on an
// already-rejected request never runs (the 100kb limit would fire first).
app.use(express.json({ limit: '4mb' }));

const auditEventRepository = new PgAuditEventRepository(pool);
const accountRepository = new PgAccountRepository(pool);
const passwordResetRepository = new PgPasswordResetRepository(pool);
const clinicSettingsRepository = new PgClinicSettingsRepository(pool);

app.use(
  '/api/v1/auth',
  authRouter({
    jwtSecret: JWT_SECRET,
    accountRepository,
    passwordResetRepository,
    auditEventRepository,
    resetTokenHmacSecret: RESET_TOKEN_HMAC_SECRET,
    sendPasswordResetLink: consoleMailer,
  }),
);
app.use('/api/v1/me', requireAuth(JWT_SECRET), accountRouter({ accountRepository, auditEventRepository }));

const patientRepository = new PgPatientRepository(pool);
app.use(
  '/api/v1/patients',
  patientsRouter({
    repository: patientRepository,
    cpfHmacSecret: CPF_HMAC_SECRET,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);

app.use(
  '/api/v1/patient',
  requireAuth(JWT_SECRET),
  requireRole('PATIENT'),
  patientProfileRouter({ repository: patientRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
);

const doctorRepository = new PgDoctorRepository(pool);
app.use(
  '/api/v1/doctors',
  doctorsRouter({
    repository: doctorRepository,
    licenseHmacSecret: LICENSE_HMAC_SECRET,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);
app.use(
  '/api/v1/doctor',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  doctorProfileRouter({ repository: doctorRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
);
app.use(
  '/api/v1/admin/doctors',
  requireAuth(JWT_SECRET),
  requireRole('ADMIN'),
  adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }),
);
app.use(
  '/api/v1/admin/accounts',
  requireAuth(JWT_SECRET),
  requireRole('ADMIN'),
  adminAccountsRouter({
    accountRepository,
    auditEventRepository,
    passwordResetRepository,
    resetTokenHmacSecret: RESET_TOKEN_HMAC_SECRET,
    sendPasswordResetLink: consoleMailer,
  }),
);
app.use(
  '/api/v1/admin/audit-events',
  requireAuth(JWT_SECRET),
  requireRole('ADMIN'),
  adminAuditRouter({ repository: auditEventRepository }),
);

const appointmentRepository = new PgAppointmentRepository(pool);
const doctorScheduleBlockRepository = new PgDoctorScheduleBlockRepository(pool);
app.use(
  '/api/v1/secretary/appointments',
  requireAuth(JWT_SECRET),
  requireRole('SECRETARY', 'ADMIN'),
  secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository, blockRepository: doctorScheduleBlockRepository }),
);
app.use(
  '/api/v1/secretary/schedule-blocks',
  requireAuth(JWT_SECRET),
  requireRole('SECRETARY', 'ADMIN'),
  secretaryScheduleBlocksRouter({ blockRepository: doctorScheduleBlockRepository, appointmentRepository, auditEventRepository }),
);
app.use(
  '/api/v1/doctor/appointments',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  doctorAppointmentsRouter({ appointmentRepository, patientRepository }),
);
app.use(
  '/api/v1/appointments/events',
  requireAuthFromHeaderOrQuery(JWT_SECRET),
  requireRole('DOCTOR', 'SECRETARY', 'ADMIN'),
  appointmentEventsRouter(),
);
app.use(
  '/api/v1/clinic-settings',
  requireAuth(JWT_SECRET),
  requireRole('SECRETARY', 'ADMIN'),
  clinicSettingsRouter({ repository: clinicSettingsRepository }),
);

const clinicalRecordRepository = new PgClinicalRecordRepository(pool);
app.use(
  '/api/v1/doctor',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  clinicalRecordsRouter({
    appointmentRepository,
    clinicalRecordRepository,
    auditEventRepository,
    doctorRepository,
    patientRepository,
    clinicSettingsRepository,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);

const prescriptionRepository = new PgPrescriptionRepository(pool);
app.use(
  '/api/v1/doctor',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  prescriptionsRouter({
    appointmentRepository,
    prescriptionRepository,
    auditEventRepository,
    doctorRepository,
    clinicSettingsRepository,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);

app.use(
  '/api/v1/patient/clinical-records',
  requireAuth(JWT_SECRET),
  requireRole('PATIENT'),
  patientClinicalRecordsRouter({
    clinicalRecordRepository,
    doctorRepository,
    patientRepository,
    clinicSettingsRepository,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);
app.use(
  '/api/v1/patient/prescriptions',
  requireAuth(JWT_SECRET),
  requireRole('PATIENT'),
  patientPrescriptionsRouter({ prescriptionRepository, doctorRepository, clinicSettingsRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
);
app.use(
  '/api/v1/patient/appointments',
  requireAuth(JWT_SECRET),
  requireRole('PATIENT'),
  patientAppointmentsRouter({ appointmentRepository, doctorRepository }),
);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' });
});

const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`API listening on :${port}`));
