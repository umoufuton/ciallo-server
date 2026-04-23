CREATE TABLE IF NOT EXISTS airports (
  id BIGSERIAL PRIMARY KEY,
  icao_code VARCHAR(8) NOT NULL UNIQUE,
  iata_code VARCHAR(8),
  name TEXT NOT NULL,
  category TEXT,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  is_suitable_alternate BOOLEAN NOT NULL DEFAULT FALSE,
  airport_briefing_url TEXT,
  taxi_in_minutes INTEGER,
  taxi_out_minutes INTEGER,
  preferred_alternates TEXT,
  sb_alt_radius INTEGER,
  sb_alt_min_ceiling INTEGER,
  sb_alt_min_rwy_length INTEGER,
  sb_alt_avoid_bad_weather BOOLEAN NOT NULL DEFAULT FALSE,
  sb_alt_exclude_airports TEXT,
  sb_takeoff_alt_code VARCHAR(8),
  sb_alt_1_code VARCHAR(8),
  sb_alt_2_code VARCHAR(8),
  sb_alt_3_code VARCHAR(8),
  sb_alt_4_code VARCHAR(8),
  passenger_lf_id INTEGER,
  luggage_lf_id INTEGER,
  cargo_weight_lf_id INTEGER,
  cargo_volume_lf_id INTEGER,
  container_ids TEXT,
  source_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  source_airport_id INTEGER,
  source_airport_icao VARCHAR(8),
  source_airport_iata VARCHAR(8),
  source_created_at TIMESTAMP,
  source_updated_at TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airports_iata_code ON airports (iata_code);
CREATE INDEX IF NOT EXISTS idx_airports_name ON airports USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_airports_is_base ON airports (is_base);
CREATE INDEX IF NOT EXISTS idx_airports_is_suitable_alternate ON airports (is_suitable_alternate);

CREATE OR REPLACE FUNCTION set_airports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_airports_updated_at ON airports;

CREATE TRIGGER trg_airports_updated_at
BEFORE UPDATE ON airports
FOR EACH ROW
EXECUTE FUNCTION set_airports_updated_at();
