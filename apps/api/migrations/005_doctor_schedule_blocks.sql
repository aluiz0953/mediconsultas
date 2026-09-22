-- Secretary-managed blocked intervals on a doctor's calendar (holidays, days
-- off, emergencies) — distinct from an appointment's DOCTOR_ABSENT status,
-- which marks an *existing* appointment after the fact. This blocks a time
-- range proactively, before any appointment is created in it.
CREATE TABLE doctor_schedule_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID REFERENCES users(id) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_schedule_block_ends_after_starts CHECK (ends_at > starts_at)
);

CREATE INDEX idx_doctor_schedule_blocks_doctor_starts_at ON doctor_schedule_blocks (doctor_id, starts_at);
