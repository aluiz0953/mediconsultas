import 'dotenv/config';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { patientsRouter } from './routes/patients.js';
import { doctorsRouter } from './routes/doctors.js';
import { adminDoctorsRouter } from './routes/admin-doctors.js';
import { secretaryAppointmentsRouter } from './routes/secretary-appointments.js';
import { doctorAppointmentsRouter } from './routes/doctor-appointments.js';
import { clinicalRecordsRouter } from './routes/clinical-records.js';
import { prescriptionsRouter } from './routes/prescriptions.js';
import { InMemoryPatientRepository } from './repositories/patient-repository.js';
import { InMemoryDoctorRepository } from './repositories/doctor-repository.js';
import { InMemoryAppointmentRepository } from './repositories/appointment-repository.js';
import { InMemoryClinicalRecordRepository } from './repositories/clinical-record-repository.js';
import { InMemoryPrescriptionRepository } from './repositories/prescription-repository.js';

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

// ponytail: in-memory repos until Docker/Postgres is available locally — swap for
// pg-backed repositories later, the route/interface don't need to change.
const patientRepository = new InMemoryPatientRepository();
app.use(
  '/api/v1/patients',
  patientsRouter({
    repository: patientRepository,
    cpfHmacSecret: CPF_HMAC_SECRET,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);

const doctorRepository = new InMemoryDoctorRepository();
app.use(
  '/api/v1/doctors',
  doctorsRouter({
    repository: doctorRepository,
    licenseHmacSecret: LICENSE_HMAC_SECRET,
    fieldEncryptionKey: FIELD_ENCRYPTION_KEY,
  }),
);
app.use('/api/v1/admin/doctors', adminDoctorsRouter({ repository: doctorRepository }));

const appointmentRepository = new InMemoryAppointmentRepository();
app.use(
  '/api/v1/secretary/appointments',
  secretaryAppointmentsRouter({ appointmentRepository, patientRepository, doctorRepository }),
);
app.use('/api/v1/doctor/appointments', doctorAppointmentsRouter({ appointmentRepository }));

const clinicalRecordRepository = new InMemoryClinicalRecordRepository();
app.use('/api/v1/doctor', clinicalRecordsRouter({ appointmentRepository, clinicalRecordRepository, fieldEncryptionKey: FIELD_ENCRYPTION_KEY }));

const prescriptionRepository = new InMemoryPrescriptionRepository();
app.use('/api/v1/doctor', prescriptionsRouter({ appointmentRepository, prescriptionRepository }));

const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`API listening on :${port}`));
