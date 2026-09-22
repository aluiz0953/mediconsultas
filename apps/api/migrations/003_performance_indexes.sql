-- Indexes matched to the actual queries in apps/api/src/repositories/*.ts —
-- not a fixed target count. Every index below exists because a real query in
-- the codebase filters, joins or orders by that exact column shape; run
-- EXPLAIN ANALYZE against production-sized data before adding more.

-- appointment-repository.ts: hasConflict() and listByDoctorAndDateRange()
-- both filter by doctor_id + a starts_at range.
CREATE INDEX idx_appointments_doctor_starts_at ON appointments (doctor_id, starts_at);
-- listByDateRange(): the secretary's day agenda, no doctor filter.
CREATE INDEX idx_appointments_starts_at ON appointments (starts_at);
-- listByPatientId(): PAT-04, most-recent-first.
CREATE INDEX idx_appointments_patient_starts_at ON appointments (patient_id, starts_at DESC);

-- clinical-record-repository.ts: listReleasedByPatientId() always filters on
-- this exact combination (PAT-06/RN-06) — a partial index matches the query precisely.
CREATE INDEX idx_clinical_records_patient_released
  ON clinical_records (patient_id)
  WHERE status = 'FINALIZED' AND released_at IS NOT NULL;

-- prescription-repository.ts: findByAppointmentId() and
-- listFinalizedByPatientId() (PAT-07) — appointment_id/patient_id have no FK
-- auto-index in Postgres, and prescriptions has no UNIQUE on appointment_id
-- (unlike clinical_records) so this one needs an explicit index.
CREATE INDEX idx_prescriptions_appointment_id ON prescriptions (appointment_id);
CREATE INDEX idx_prescriptions_patient_finalized
  ON prescriptions (patient_id)
  WHERE status = 'FINALIZED';
-- Joined once per prescription in findById()/listFinalizedByPatientId().
CREATE INDEX idx_prescription_items_prescription_id ON prescription_items (prescription_id);

-- doctor-repository.ts: listPending()/listApproved() filter on this column alone.
CREATE INDEX idx_doctor_profiles_approval_status ON doctor_profiles (approval_status);

-- audit-event-repository.ts: default listing is ORDER BY created_at DESC
-- LIMIT $n; action/resource_type/actor_user_id are independently optional
-- WHERE filters (ADM-02/admin-audit), so separate single-column indexes serve
-- more query shapes than one fixed-order composite would.
CREATE INDEX idx_audit_events_created_at ON audit_events (created_at DESC);
CREATE INDEX idx_audit_events_action ON audit_events (action);
CREATE INDEX idx_audit_events_resource_type ON audit_events (resource_type);
CREATE INDEX idx_audit_events_actor_user_id ON audit_events (actor_user_id);

-- password-reset-repository.ts: invalidateAllForUser() filters by user_id
-- with used_at IS NULL — a partial index matches that exact write path.
CREATE INDEX idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- patients.ts / secretary-appointments.ts: PatientRepository.search() does
-- `full_name ILIKE '%term%'` for the SEC-04 patient picker — a leading
-- wildcard, so a plain btree index can't help; pg_trgm + GIN is the standard
-- fix for ILIKE substring search in Postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_patient_profiles_full_name_trgm
  ON patient_profiles USING gin (full_name gin_trgm_ops);
