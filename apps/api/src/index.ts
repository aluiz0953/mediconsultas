import 'dotenv/config';
// Must load before any router: patches express.Router so a rejected promise
// inside an async handler reaches the error middleware instead of crashing
// the process (Express 4 doesn't do this on its own; Express 5 would).
import 'express-async-errors';
import express from 'express';
import { pool } from './db.js';
import { requireAuth, requireRole } from './auth/middleware.js';
import { authRouter } from './routes/auth.js';
import { patientsRouter } from './routes/patients.js';
import { doctorsRouter } from './routes/doctors.js';
import { adminDoctorsRouter } from './routes/admin-doctors.js';
import { adminAuditRouter } from './routes/admin-audit.js';
import { secretaryAppointmentsRouter } from './routes/secretary-appointments.js';
import { doctorAppointmentsRouter } from './routes/doctor-appointments.js';
import { clinicalRecordsRouter } from './routes/clinical-records.js';
import { prescriptionsRouter } from './routes/prescriptions.js';
import { patientClinicalRecordsRouter } from './routes/patient-clinical-records.js';
import { patientPrescriptionsRouter } from './routes/patient-prescriptions.js';
import { patientAppointmentsRouter } from './routes/patient-appointments.js';
import { PgPatientRepository } from './repositories/patient-repository.js';
import { PgDoctorRepository } from './repositories/doctor-repository.js';
import { PgAppointmentRepository } from './repositories/appointment-repository.js';
import { PgClinicalRecordRepository } from './repositories/clinical-record-repository.js';
import { PgPrescriptionRepository } from './repositories/prescription-repository.js';
import { PgAuditEventRepository } from './repositories/audit-event-repository.js';

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

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRouter(JWT_SECRET));

const auditEventRepository = new PgAuditEventRepository(pool);

const patientRepository = new PgPatientRepository(pool);
app.use(
  '/api/v1/patients',
  patientsRouter({
    repository: patientRepository,
    cpfHmacSecret: CPF_HMAC_SECRET,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
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
  '/api/v1/admin/doctors',
  requireAuth(JWT_SECRET),
  requireRole('ADMIN'),
  adminDoctorsRouter({ repository: doctorRepository, auditEventRepository }),
);
app.use(
  '/api/v1/admin/audit-events',
  requireAuth(JWT_SECRET),
  requireRole('ADMIN'),
  adminAuditRouter({ repository: auditEventRepository }),
);

const appointmentRepository = new PgAppointmentRepository(pool);
app.use(
  '/api/v1/secretary/appointments',
  requireAuth(JWT_SECRET),
  requireRole('SECRETARY', 'ADMIN'),
  secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository }),
);
app.use(
  '/api/v1/doctor/appointments',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  doctorAppointmentsRouter({ appointmentRepository, patientRepository }),
);

const clinicalRecordRepository = new PgClinicalRecordRepository(pool);
app.use(
  '/api/v1/doctor',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  clinicalRecordsRouter({ appointmentRepository, clinicalRecordRepository, auditEventRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
);

const prescriptionRepository = new PgPrescriptionRepository(pool);
app.use(
  '/api/v1/doctor',
  requireAuth(JWT_SECRET),
  requireRole('DOCTOR'),
  prescriptionsRouter({ appointmentRepository, prescriptionRepository, auditEventRepository }),
);

app.use(
  '/api/v1/patient/clinical-records',
  requireAuth(JWT_SECRET),
  requireRole('PATIENT'),
  patientClinicalRecordsRouter({ clinicalRecordRepository, doctorRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }),
);
app.use(
  '/api/v1/patient/prescriptions',
  requireAuth(JWT_SECRET),
  requireRole('PATIENT'),
  patientPrescriptionsRouter({ prescriptionRepository, doctorRepository }),
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
