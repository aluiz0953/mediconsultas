-- Sign-up verification code (6 digits) sent to the e-mail or phone the person
-- chose. Registration only goes through with a verified, unused record whose
-- destination matches the submitted e-mail/phone. Only an HMAC of the code is stored.
CREATE TABLE contact_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel VARCHAR(10) NOT NULL, -- email | sms
    destination VARCHAR(320) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contact_verifications_destination_idx ON contact_verifications (destination, created_at DESC);
