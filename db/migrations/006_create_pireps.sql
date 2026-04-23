CREATE TABLE IF NOT EXISTS pireps (
  id BIGSERIAL PRIMARY KEY,
  source_pirep_id BIGINT,
  pilot_id BIGINT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  source_pilot_id BIGINT,
  airline_id INTEGER,
  user_id INTEGER,
  username VARCHAR(64),
  callsign VARCHAR(32),
  flight_number VARCHAR(32),
  status VARCHAR(32),
  type VARCHAR(32),
  network VARCHAR(32),
  booking_id BIGINT,
  route_id BIGINT,
  departure_airport_id BIGINT,
  arrival_airport_id BIGINT,
  departure_airport_code VARCHAR(8),
  arrival_airport_code VARCHAR(8),
  aircraft_id BIGINT,
  fleet_id BIGINT,
  livery_id BIGINT,
  landing_rate INTEGER,
  landing_g NUMERIC(6,3),
  flight_distance NUMERIC(10,2),
  flight_length INTEGER,
  block_length INTEGER,
  credited_time INTEGER,
  fuel_used NUMERIC(12,2),
  points INTEGER,
  bonus_sum INTEGER,
  booking_type VARCHAR(32),
  internal_note TEXT,
  simulator_version TEXT,
  acars_version TEXT,
  off_blocks_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  landing_time TIMESTAMPTZ,
  on_blocks_time TIMESTAMPTZ,
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  raw_log JSONB,
  raw_pirep_data JSONB,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pireps_source_pirep_id_not_null
ON pireps (source_pirep_id)
WHERE source_pirep_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pireps_pilot_id_created_at
ON pireps (pilot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pireps_username_created_at
ON pireps (LOWER(username), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pireps_status
ON pireps (status);

CREATE INDEX IF NOT EXISTS idx_pireps_source_created_at
ON pireps (source_created_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION set_pireps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pireps_updated_at ON pireps;

CREATE TRIGGER trg_pireps_updated_at
BEFORE UPDATE ON pireps
FOR EACH ROW
EXECUTE FUNCTION set_pireps_updated_at();
