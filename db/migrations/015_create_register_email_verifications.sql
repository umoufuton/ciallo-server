CREATE TABLE IF NOT EXISTS register_email_verifications (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(254) NOT NULL,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_register_email_verifications_username_lower
ON register_email_verifications ((LOWER(username)));

CREATE INDEX IF NOT EXISTS idx_register_email_verifications_email_lower
ON register_email_verifications ((LOWER(email)));

CREATE OR REPLACE FUNCTION set_register_email_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_register_email_verifications_updated_at ON register_email_verifications;

CREATE TRIGGER trg_register_email_verifications_updated_at
BEFORE UPDATE ON register_email_verifications
FOR EACH ROW
EXECUTE FUNCTION set_register_email_verifications_updated_at();
