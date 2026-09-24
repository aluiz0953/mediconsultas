-- Which client produced a login event: 'web' (browser) or 'android' (Capacitor app).
-- Both clients share this API and database; this only tells them apart in the audit log.
-- NULL for events recorded before this column existed or from clients that don't identify.
ALTER TABLE audit_events ADD COLUMN platform VARCHAR(20);
