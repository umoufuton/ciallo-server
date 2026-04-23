CREATE TABLE IF NOT EXISTS ranks (
  id BIGSERIAL PRIMARY KEY,
  source_rank_id BIGINT NOT NULL UNIQUE,
  airline_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation VARCHAR(32),
  description TEXT,
  image_url TEXT,
  honorary_rank BOOLEAN NOT NULL DEFAULT FALSE,
  required_hours INTEGER NOT NULL DEFAULT 0,
  required_points INTEGER NOT NULL DEFAULT 0,
  required_bonus INTEGER NOT NULL DEFAULT 0,
  required_pireps INTEGER NOT NULL DEFAULT 0,
  show_abbreviation BOOLEAN NOT NULL DEFAULT TRUE,
  abbreviation_position VARCHAR(8),
  abbreviation_separator VARCHAR(16),
  regular_pilots_count INTEGER,
  honorary_pilots_count INTEGER,
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ranks_airline_level
ON ranks (airline_id, level);

CREATE INDEX IF NOT EXISTS idx_ranks_airline_id
ON ranks (airline_id);

CREATE INDEX IF NOT EXISTS idx_ranks_honorary
ON ranks (honorary_rank);

CREATE OR REPLACE FUNCTION set_ranks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ranks_updated_at ON ranks;

CREATE TRIGGER trg_ranks_updated_at
BEFORE UPDATE ON ranks
FOR EACH ROW
EXECUTE FUNCTION set_ranks_updated_at();
