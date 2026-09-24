-- Doctor's attendance queue switch (home page button): OPEN (green) / PAUSED (red).
-- Anything not set today reads as CLOSED, so each day starts with the queue closed.
ALTER TABLE doctor_profiles ADD COLUMN queue_status VARCHAR(10) NOT NULL DEFAULT 'CLOSED';
ALTER TABLE doctor_profiles ADD COLUMN queue_status_updated_at TIMESTAMPTZ;
