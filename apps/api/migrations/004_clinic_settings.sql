-- Single-row table for clinic-wide branding, configured by the secretary or
-- admin and used as the letterhead logo on generated PDFs (receita/prontuário).
-- The `id = TRUE` check makes it a singleton: only one row can ever exist.
CREATE TABLE clinic_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    logo_base64 TEXT,
    logo_content_type VARCHAR(50),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);
