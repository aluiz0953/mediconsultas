-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. ENUMS (Tipos de Dados Restritos)
-- ==========================================
CREATE TYPE user_status AS ENUM ('PENDING', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED');
CREATE TYPE user_role AS ENUM ('ADMIN', 'SECRETARY', 'DOCTOR', 'PATIENT');
CREATE TYPE doctor_approval_status AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE document_status AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'REPLACED');
CREATE TYPE appointment_status AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PATIENT_ABSENT', 'DOCTOR_ABSENT');
CREATE TYPE clinical_record_status AS ENUM ('DRAFT', 'FINALIZED', 'AMENDED', 'ARCHIVED');
CREATE TYPE prescription_status AS ENUM ('DRAFT', 'FINALIZED', 'SUPERSEDED', 'CANCELLED');

-- ==========================================
-- 2. TABELAS DE IDENTIDADE E PERFIS
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(320) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    status user_status NOT NULL DEFAULT 'PENDING',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE patient_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    cpf_ciphertext TEXT NOT NULL,
    cpf_hash CHAR(64) UNIQUE NOT NULL,
    birth_date DATE NOT NULL,
    phone_ciphertext TEXT,
    address_ciphertext TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE doctor_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    license_number_ciphertext TEXT NOT NULL,
    license_hash CHAR(64) UNIQUE NOT NULL,
    license_state CHAR(2) NOT NULL,
    specialty VARCHAR(150),
    approval_status doctor_approval_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    approval_reason TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ
);

CREATE TABLE doctor_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID REFERENCES doctor_profiles(user_id) ON DELETE CASCADE,
    document_type VARCHAR(80) NOT NULL,
    object_key TEXT NOT NULL,
    content_hash CHAR(64) NOT NULL,
    status document_status NOT NULL DEFAULT 'SUBMITTED',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID REFERENCES users(id)
);

-- ==========================================
-- 3. TABELAS DE AGENDA
-- ==========================================
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES users(id) NOT NULL,
    doctor_id UUID REFERENCES users(id) NOT NULL,
    unit_id UUID,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status appointment_status NOT NULL DEFAULT 'SCHEDULED',
    administrative_notes_ciphertext TEXT,
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancel_reason TEXT,
    CONSTRAINT chk_ends_after_starts CHECK (ends_at > starts_at)
);

-- ==========================================
-- 4. TABELAS DE CLÍNICA E PRONTUÁRIO
-- ==========================================
CREATE TABLE clinical_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE REFERENCES appointments(id) NOT NULL,
    patient_id UUID REFERENCES users(id) NOT NULL,
    doctor_id UUID REFERENCES users(id) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status clinical_record_status NOT NULL DEFAULT 'DRAFT',
    clinical_content_ciphertext TEXT,
    content_hash CHAR(64),
    finalized_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    supersedes_record_id UUID REFERENCES clinical_records(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(id) NOT NULL,
    patient_id UUID REFERENCES users(id) NOT NULL,
    doctor_id UUID REFERENCES users(id) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status prescription_status NOT NULL DEFAULT 'DRAFT',
    -- DOC-06 AC: a prescription can be explicitly marked as not needed instead of having items.
    no_medication_needed BOOLEAN NOT NULL DEFAULT FALSE,
    issued_at TIMESTAMPTZ,
    document_object_key TEXT,
    document_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prescription_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    strength VARCHAR(100),
    presentation VARCHAR(100),
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    quantity VARCHAR(100),
    instructions TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- ==========================================
-- 5. TABELAS DE AUDITORIA E MENSAGERIA
-- ==========================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    message_template TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES users(id),
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    patient_id UUID REFERENCES users(id),
    result VARCHAR(20) NOT NULL,
    reason TEXT,
    request_id VARCHAR(100),
    ip_hash CHAR(64),
    user_agent_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
