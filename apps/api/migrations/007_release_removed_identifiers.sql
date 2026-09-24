-- A removed account (users.deleted_at set) keeps its patient/doctor profile row for
-- clinical history, but must not keep reserving its CPF/CRM: the person has to be
-- able to register again. Swap the unique hashes for a per-user tombstone (still
-- unique, never equal to a real HMAC). New removals do the same in the repository.
UPDATE patient_profiles p
SET cpf_hash = encode(sha256(convert_to('removed:' || p.user_id::text, 'UTF8')), 'hex')
FROM users u
WHERE u.id = p.user_id AND u.deleted_at IS NOT NULL;

UPDATE doctor_profiles d
SET license_hash = encode(sha256(convert_to('removed:' || d.user_id::text, 'UTF8')), 'hex')
FROM users u
WHERE u.id = d.user_id AND u.deleted_at IS NOT NULL;
