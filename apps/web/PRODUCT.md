# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Secretária**: front-desk staff at a single Brazilian clinic. Schedules, confirms, and cancels appointments; manages doctor/admin accounts; blocks agenda time (holidays, days off); uploads the clinic's logo.
- **Médico (doctor)**: attends a daily queue of confirmed appointments, writes and finalizes clinical records and prescriptions, downloads PDFs.
- **Paciente (patient)**: self-registers, books no appointments directly (the secretary does), views released clinical guidance and prescriptions, downloads PDFs.
- **Administrador**: approves/rejects doctor registrations, manages ADMIN/SECRETARY accounts and roles, reviews the audit log.

All four roles authenticate through the same login screen before reaching their role-specific area.

## Product Purpose

MediConsultas is the operational system of record for a single clinic: scheduling, clinical records, and prescriptions, with role-based access and an append-only audit trail. It exists to replace ad-hoc/paper coordination between secretary, doctor, and patient with one authenticated system. Success is a clinic that can run its daily appointment flow — book, confirm, attend, document, prescribe, release to patient — without manual reconciliation.

## Positioning

*(Inferred from the codebase's own design choices — not a claim the user confirmed; flagging per the interview substitution rule since no separate round was run for this internal-tool project.)* MediConsultas' distinguishing mechanism, versus a generic scheduling tool, is that clinical data (CPF, records, prescriptions) is encrypted at rest and every sensitive action is written to an immutable audit log (`audit_events`) — a compliance-first design for handling patient data under Brazilian privacy expectations (LGPD-adjacent), not just an appointment calendar.

## Operating Context

- Single clinic, single tenant — no multi-clinic/multi-tenant concept exists.
- Runs locally in development against a real PostgreSQL instance; no production deployment exists yet.
- Backend: Node/Express + PostgreSQL, JWT auth, role middleware (`ADMIN`/`SECRETARY`/`DOCTOR`/`PATIENT`).
- Real-time queue/agenda sync via Server-Sent Events (SSE) between doctor and secretary screens.
- PDF generation (clinical records, prescriptions) with a shared letterhead that can carry the clinic's uploaded logo.
- All UI copy is Brazilian Portuguese.

## Capabilities and Constraints

- CPF is stored encrypted and is only ever searched by exact hash match, never substring/ILIKE.
- Password policy: 10+ chars, upper/lower/number/symbol; bcrypt (native binding) hashing.
- Account lockout after 5 failed logins (15 min).
- Doctors self-register but require admin approval before they can be scheduled.
- Patients self-register and are active immediately (no email verification flow exists).
- Admin/Secretary accounts are invite-only (no self-registration for those roles).
- E2E tests (Playwright) assert on exact visible copy for several flows (button labels, form labels/placeholders) — any surface redesign must not change that copy without updating `e2e/mediconsultas-flow.spec.ts`.

## Brand Commitments

- Product name: **MediConsultas**, tagline "Cuidado conectado".
- Existing in-app chrome (sidebar, dashboards, all authenticated screens) uses an emerald-green accent (`emerald-500/600`) on a neutral gray scale, with a heart-in-rounded-square mark as the logo, and the Outfit typeface app-wide.
- **Explicitly not binding on the login screen**: the user has approved the login screen departing from this established emerald/neutral identity if that produces a more sophisticated result — this is a deliberate exception being made now, not an oversight.

## Evidence on Hand

- No marketing copy, testimonials, pricing, or case studies exist or are needed — this is an internal operational tool, not something being sold.
- No real clinic logo/photography exists yet; the app supports the secretary uploading one (PNG/JPEG ≤2MB) but none has been provided.
- Four working demo accounts exist for manual testing (admin/secretary/doctor/patient), all password `Senha#Forte10`.

## Product Principles

1. Never fabricate clinical, legal, or compliance capability that the backend doesn't actually have.
2. Preserve exact E2E-asserted copy and form semantics when changing visuals.
3. Sensitive data (CPF, clinical content, credentials) never appears in the clear in UI, logs, or exports beyond what the backend already masks.
4. Portuguese (pt-BR) throughout; no English strings in user-facing copy.
5. Single-clinic scope — do not design as if multi-tenant.

## Accessibility & Inclusion

No formal accessibility standard has been mandated by the user. Existing work already added visible focus-visible rings and honors `prefers-reduced-motion` for decorative animation; keep both by default rather than treating them as optional.
