CREATE TABLE IF NOT EXISTS fleets (
  id BIGSERIAL PRIMARY KEY,
  source_fleet_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type_code VARCHAR(16) NOT NULL,
  type_category TEXT,
  max_passengers INTEGER,
  max_freight NUMERIC(12, 2),
  container_units INTEGER,
  hide_in_phoenix BOOLEAN NOT NULL DEFAULT FALSE,
  pirep_scoring_group_id INTEGER,
  allowed_prefix_ids TEXT,
  sb_ofp_layout TEXT,
  sb_perf_code TEXT,
  sb_weight_cat TEXT,
  sb_etops_threshold INTEGER,
  sb_etops_cert TEXT,
  sb_icao_equip TEXT,
  sb_icao_transponder TEXT,
  sb_pbn_capability TEXT,
  sb_extra_fpl_info TEXT,
  sb_engine_type TEXT,
  sb_pax_weight NUMERIC(12, 2),
  sb_bag_weight NUMERIC(12, 2),
  sb_oew NUMERIC(12, 2),
  sb_mzfw NUMERIC(12, 2),
  sb_mtow NUMERIC(12, 2),
  sb_mlw NUMERIC(12, 2),
  sb_max_fuel_cap NUMERIC(12, 2),
  sb_contingency_fuel NUMERIC(12, 2),
  sb_reserve_fuel NUMERIC(12, 2),
  sb_block_fuel NUMERIC(12, 2),
  sb_block_fuel_units TEXT,
  sb_arrival_fuel NUMERIC(12, 2),
  sb_arrival_fuel_units TEXT,
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
  sb_fuel_factor NUMERIC(12, 4),
  sb_service_ceiling INTEGER,
  sb_cruise_profile TEXT,
  sb_cost_index INTEGER,
  sb_climb_profile TEXT,
  sb_descent_profile TEXT,
  sb_altn_radius INTEGER,
  sb_altn_min_ceiling INTEGER,
  sb_altn_min_rwy_length INTEGER,
  sb_altn_avoid_bad_wx BOOLEAN NOT NULL DEFAULT FALSE,
  source_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleets_type_code ON fleets (type_code);
CREATE INDEX IF NOT EXISTS idx_fleets_name ON fleets USING GIN (to_tsvector('simple', name));

CREATE OR REPLACE FUNCTION set_fleets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fleets_updated_at ON fleets;

CREATE TRIGGER trg_fleets_updated_at
BEFORE UPDATE ON fleets
FOR EACH ROW
EXECUTE FUNCTION set_fleets_updated_at();

CREATE TABLE IF NOT EXISTS aircraft (
  id BIGSERIAL PRIMARY KEY,
  source_aircraft_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  registration VARCHAR(32) NOT NULL UNIQUE,
  selcal VARCHAR(16),
  fin_number VARCHAR(32),
  hex_code VARCHAR(32),
  fleet_id BIGINT REFERENCES fleets(id) ON DELETE SET NULL,
  source_fleet_id INTEGER,
  passengers INTEGER,
  freight NUMERIC(12, 2),
  container_units INTEGER,
  sb_ofp_layout TEXT,
  sb_perf_code TEXT,
  sb_weight_cat TEXT,
  sb_etops_threshold INTEGER,
  sb_etops_cert TEXT,
  sb_icao_equip TEXT,
  sb_icao_transponder TEXT,
  sb_pbn_capability TEXT,
  sb_extra_fpl_info TEXT,
  sb_engine_type TEXT,
  sb_pax_weight NUMERIC(12, 2),
  sb_bag_weight NUMERIC(12, 2),
  sb_oew NUMERIC(12, 2),
  sb_mzfw NUMERIC(12, 2),
  sb_mtow NUMERIC(12, 2),
  sb_mlw NUMERIC(12, 2),
  sb_max_fuel_cap NUMERIC(12, 2),
  sb_contingency_fuel NUMERIC(12, 2),
  sb_reserve_fuel NUMERIC(12, 2),
  sb_block_fuel NUMERIC(12, 2),
  sb_block_fuel_units TEXT,
  sb_arrival_fuel NUMERIC(12, 2),
  sb_arrival_fuel_units TEXT,
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
  sb_fuel_factor NUMERIC(12, 4),
  sb_service_ceiling INTEGER,
  sb_cruise_profile TEXT,
  sb_cost_index INTEGER,
  sb_climb_profile TEXT,
  sb_descent_profile TEXT,
  internal_remarks TEXT,
  source_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_registration ON aircraft (registration);
CREATE INDEX IF NOT EXISTS idx_aircraft_source_fleet_id ON aircraft (source_fleet_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_name ON aircraft USING GIN (to_tsvector('simple', name));

CREATE OR REPLACE FUNCTION set_aircraft_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aircraft_updated_at ON aircraft;

CREATE TRIGGER trg_aircraft_updated_at
BEFORE UPDATE ON aircraft
FOR EACH ROW
EXECUTE FUNCTION set_aircraft_updated_at();
