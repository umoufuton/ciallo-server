ALTER TABLE pilots
  ADD COLUMN IF NOT EXISTS email VARCHAR(254),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verify_target VARCHAR(254),
  ADD COLUMN IF NOT EXISTS email_verify_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_code_salt TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verify_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verify_attempts INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pilots_email_lower
ON pilots ((LOWER(email)))
WHERE email IS NOT NULL;
