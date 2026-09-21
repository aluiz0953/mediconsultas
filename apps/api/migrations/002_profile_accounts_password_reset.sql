-- RF-03/PAT-02/DOC: doctors get the same self-editable phone/address fields
-- patients already have.
ALTER TABLE doctor_profiles ADD COLUMN phone_ciphertext TEXT;
ALTER TABLE doctor_profiles ADD COLUMN address_ciphertext TEXT;

-- ADM-03: display name for accounts with no dedicated profile table
-- (ADMIN/SECRETARY). PATIENT/DOCTOR keep their real name in
-- patient_profiles/doctor_profiles and leave this NULL.
ALTER TABLE users ADD COLUMN full_name VARCHAR(200);

-- RF-01: lockout after repeated failed logins.
ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;

-- PAT-03 / ADM-03 / §16.1 "access_tokens": one-time hashed tokens used both
-- for "forgot password" and for an admin-invited account's first password.
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token_hash CHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
