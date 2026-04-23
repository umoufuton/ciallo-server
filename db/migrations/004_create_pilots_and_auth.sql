CREATE TABLE IF NOT EXISTS pilots (
  id BIGSERIAL PRIMARY KEY,
  source_pilot_id BIGINT NOT NULL UNIQUE,
  airline_id INTEGER NOT NULL,
  user_id INTEGER,
  username VARCHAR(64) NOT NULL,
  name TEXT NOT NULL,
  discord_id VARCHAR(64),
  rank_id INTEGER,
  honorary_rank_id INTEGER,
  prefer_honorary_rank BOOLEAN NOT NULL DEFAULT FALSE,
  hub_id INTEGER,
  location_id INTEGER,
  permanent_remove BOOLEAN NOT NULL DEFAULT FALSE,
  frozen_date TIMESTAMP,
  airline_ban BOOLEAN NOT NULL DEFAULT FALSE,
  platform_ban BOOLEAN NOT NULL DEFAULT FALSE,
  holiday_allowance INTEGER,
  under_activity_grace BOOLEAN,
  activity_grace_since TIMESTAMP,
  activity_whitelist BOOLEAN,
  activity_type TEXT,
  created_at_external TIMESTAMPTZ,
  deleted_at_external TIMESTAMPTZ,
  statistics JSONB,
  password_hash TEXT,
  password_salt TEXT,
  password_algo VARCHAR(32),
  password_set_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pilots_username_lower ON pilots ((LOWER(username)));
CREATE INDEX IF NOT EXISTS idx_pilots_airline_id ON pilots (airline_id);
CREATE INDEX IF NOT EXISTS idx_pilots_hub_id ON pilots (hub_id);
CREATE INDEX IF NOT EXISTS idx_pilots_rank_id ON pilots (rank_id);

CREATE OR REPLACE FUNCTION set_pilots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pilots_updated_at ON pilots;

CREATE TRIGGER trg_pilots_updated_at
BEFORE UPDATE ON pilots
FOR EACH ROW
EXECUTE FUNCTION set_pilots_updated_at();
