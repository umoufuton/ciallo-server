CREATE TABLE IF NOT EXISTS nav_airac_cycles (
  cycle VARCHAR(8) PRIMARY KEY,
  revision VARCHAR(32),
  package_id TEXT,
  package_status VARCHAR(32),
  format TEXT,
  description TEXT,
  source_key TEXT,
  source_file_hash TEXT,
  dataset_version TEXT,
  effective_fromto TEXT,
  parsed_at TEXT,
  header JSONB,
  waypoint_count INTEGER NOT NULL DEFAULT 0,
  airway_point_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nav_waypoints (
  id BIGSERIAL PRIMARY KEY,
  cycle VARCHAR(8) NOT NULL REFERENCES nav_airac_cycles(cycle) ON DELETE CASCADE,
  ident VARCHAR(16) NOT NULL,
  area_code VARCHAR(8),
  continent TEXT,
  country TEXT,
  datum_code VARCHAR(8),
  icao_code VARCHAR(8),
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  name TEXT,
  waypoint_type VARCHAR(8),
  waypoint_usage VARCHAR(8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nav_airway_points (
  id BIGSERIAL PRIMARY KEY,
  cycle VARCHAR(8) NOT NULL REFERENCES nav_airac_cycles(cycle) ON DELETE CASCADE,
  route_identifier VARCHAR(16) NOT NULL,
  route_identifier_postfix VARCHAR(8),
  route_type VARCHAR(8),
  seqno INTEGER NOT NULL,
  area_code VARCHAR(8),
  icao_code VARCHAR(8),
  waypoint_identifier VARCHAR(16) NOT NULL,
  waypoint_ref_table VARCHAR(8),
  waypoint_description_code VARCHAR(16),
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  direction_restriction VARCHAR(8),
  flightlevel VARCHAR(8),
  inbound_course NUMERIC(8, 3),
  inbound_distance NUMERIC(10, 3),
  outbound_course NUMERIC(8, 3),
  minimum_altitude1 INTEGER,
  minimum_altitude2 INTEGER,
  maximum_altitude INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nav_route_expand_cache (
  cache_key TEXT PRIMARY KEY,
  cycle VARCHAR(8) NOT NULL REFERENCES nav_airac_cycles(cycle) ON DELETE CASCADE,
  departure_icao VARCHAR(8),
  arrival_icao VARCHAR(8),
  route_text TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_waypoints_cycle_ident
ON nav_waypoints (cycle, ident);

CREATE INDEX IF NOT EXISTS idx_nav_waypoints_cycle_ident_location
ON nav_waypoints (cycle, ident, icao_code, area_code);

CREATE INDEX IF NOT EXISTS idx_nav_airway_points_cycle_route_seq
ON nav_airway_points (cycle, route_identifier, seqno);

CREATE INDEX IF NOT EXISTS idx_nav_airway_points_cycle_route_fix
ON nav_airway_points (cycle, route_identifier, waypoint_identifier);

CREATE INDEX IF NOT EXISTS idx_nav_airac_cycles_active
ON nav_airac_cycles (is_active)
WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION set_nav_airac_cycles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nav_airac_cycles_updated_at ON nav_airac_cycles;

CREATE TRIGGER trg_nav_airac_cycles_updated_at
BEFORE UPDATE ON nav_airac_cycles
FOR EACH ROW
EXECUTE FUNCTION set_nav_airac_cycles_updated_at();

CREATE OR REPLACE FUNCTION set_nav_route_expand_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nav_route_expand_cache_updated_at ON nav_route_expand_cache;

CREATE TRIGGER trg_nav_route_expand_cache_updated_at
BEFORE UPDATE ON nav_route_expand_cache
FOR EACH ROW
EXECUTE FUNCTION set_nav_route_expand_cache_updated_at();
