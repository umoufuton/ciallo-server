ALTER TABLE pilots
ADD COLUMN IF NOT EXISTS current_airport_icao VARCHAR(4);

CREATE INDEX IF NOT EXISTS idx_pilots_current_airport_icao
ON pilots (current_airport_icao);

CREATE TABLE IF NOT EXISTS pilot_dispatches (
  id BIGSERIAL PRIMARY KEY,
  pilot_id BIGINT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL,
  departure_icao VARCHAR(4) NOT NULL,
  arrival_icao VARCHAR(4) NOT NULL,
  flight_number VARCHAR(32),
  callsign VARCHAR(32),
  operator_code VARCHAR(16),
  route_id BIGINT,
  fleet_id BIGINT,
  aircraft_id BIGINT,
  aircraft_type VARCHAR(32),
  registration VARCHAR(32),
  dispatch_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  CONSTRAINT chk_pilot_dispatch_status CHECK (
    status IN ('ACTIVE', 'IN_PROGRESS', 'CLEARED', 'CANCELLED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pilot_dispatch_active
ON pilot_dispatches (pilot_id)
WHERE status IN ('ACTIVE', 'IN_PROGRESS');

CREATE INDEX IF NOT EXISTS idx_pilot_dispatches_pilot_created_at
ON pilot_dispatches (pilot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pilot_dispatches_status
ON pilot_dispatches (status);

CREATE OR REPLACE FUNCTION set_pilot_dispatches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pilot_dispatches_updated_at ON pilot_dispatches;

CREATE TRIGGER trg_pilot_dispatches_updated_at
BEFORE UPDATE ON pilot_dispatches
FOR EACH ROW
EXECUTE FUNCTION set_pilot_dispatches_updated_at();
