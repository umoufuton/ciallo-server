ALTER TABLE pilots
ADD COLUMN IF NOT EXISTS external_source TEXT,
ADD COLUMN IF NOT EXISTS external_last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS external_raw JSONB;

CREATE INDEX IF NOT EXISTS idx_pilots_external_source ON pilots (external_source);
