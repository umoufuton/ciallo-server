CREATE TABLE IF NOT EXISTS scheduled_routes (
  id BIGSERIAL PRIMARY KEY,
  source_route_id BIGINT NOT NULL UNIQUE,
  departure_airport_code VARCHAR(8) NOT NULL,
  arrival_airport_code VARCHAR(8) NOT NULL,
  route_type TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  departure_time TEXT,
  arrival_time TEXT,
  callsign TEXT,
  flight_number TEXT,
  altitude TEXT,
  cost_index INTEGER,
  flight_length TEXT,
  flight_distance_nm INTEGER,
  service_days TEXT,
  routing TEXT,
  remarks TEXT,
  internal_remarks TEXT,
  tags TEXT[],
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  flight_rules TEXT,
  flight_type TEXT,
  allow_callsign_change BOOLEAN NOT NULL DEFAULT FALSE,
  cs_defaults_username_opt1 BOOLEAN NOT NULL DEFAULT FALSE,
  cs_defaults_username_opt2 BOOLEAN NOT NULL DEFAULT FALSE,
  cs_defaults_aircraft_reg BOOLEAN NOT NULL DEFAULT FALSE,
  callsign_generator_str TEXT,
  pax_lf_id INTEGER,
  pax_luggage_lf_id INTEGER,
  cargo_lf_id INTEGER,
  cargo_volume_lf_id INTEGER,
  container_ids INTEGER[],
  fleet_source_ids INTEGER[],
  sb_mel_fuel NUMERIC(12, 2),
  sb_mel_fuel_units TEXT,
  sb_atc_fuel NUMERIC(12, 2),
  sb_atc_fuel_units TEXT,
  sb_wxx_fuel NUMERIC(12, 2),
  sb_wxx_fuel_units TEXT,
  sb_extra_fuel NUMERIC(12, 2),
  sb_extra_fuel_units TEXT,
  sb_tankering_fuel NUMERIC(12, 2),
  sb_tankering_fuel_units TEXT,
  sb_min_fob NUMERIC(12, 2),
  sb_min_fob_units TEXT,
  sb_min_fod NUMERIC(12, 2),
  sb_min_fod_units TEXT,
  sb_pax_wgt NUMERIC(12, 2),
  sb_bag_wgt NUMERIC(12, 2),
  sb_enroute_altn TEXT,
  sb_takeoff_altn TEXT,
  sb_altn_1 TEXT,
  sb_altn_2 TEXT,
  sb_altn_3 TEXT,
  sb_altn_4 TEXT,
  sb_contingency_fuel NUMERIC(12, 2),
  sb_reserve_fuel NUMERIC(12, 2),
  source_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_routes_departure ON scheduled_routes (departure_airport_code);
CREATE INDEX IF NOT EXISTS idx_scheduled_routes_arrival ON scheduled_routes (arrival_airport_code);
CREATE INDEX IF NOT EXISTS idx_scheduled_routes_flight_number ON scheduled_routes (flight_number);
CREATE INDEX IF NOT EXISTS idx_scheduled_routes_callsign ON scheduled_routes (callsign);
CREATE INDEX IF NOT EXISTS idx_scheduled_routes_fleet_source_ids ON scheduled_routes USING GIN (fleet_source_ids);
CREATE INDEX IF NOT EXISTS idx_scheduled_routes_tags ON scheduled_routes USING GIN (tags);

CREATE OR REPLACE FUNCTION set_scheduled_routes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_routes_updated_at ON scheduled_routes;

CREATE TRIGGER trg_scheduled_routes_updated_at
BEFORE UPDATE ON scheduled_routes
FOR EACH ROW
EXECUTE FUNCTION set_scheduled_routes_updated_at();
