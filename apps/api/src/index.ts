import 'dotenv/config';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { patientsRouter } from './routes/patients.js';
import { doctorsRouter } from './routes/doctors.js';
import { adminDoctorsRouter } from './routes/admin-doctors.js';
import { InMemoryPatientRepository } from './repositories/patient-repository.js';
import { InMemoryDoctorRepository } from './repositories/doctor-repository.js';

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

// ponytail: in-memory repo until Docker/Postgres is available locally — swap for
// a pg-backed PatientRepository later, the route/interface don't need to change.
app.use(
  '/api/v1/patients',
  patientsRouter({
    repository: new InMemoryPatientRepository(),
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

const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`API listening on :${port}`));
