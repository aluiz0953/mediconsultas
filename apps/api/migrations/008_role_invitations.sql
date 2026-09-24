-- An admin invites an EXISTING account to become ADMIN or SECRETARY; the role only
-- changes once the invitee accepts it from inside their own account.
CREATE TABLE role_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    invited_by UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | ACCEPTED | DECLINED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX role_invitations_one_pending_per_user ON role_invitations (user_id) WHERE status = 'PENDING';
