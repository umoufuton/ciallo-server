CREATE TABLE IF NOT EXISTS pilot_pirep_sync_state (
  pilot_id BIGINT PRIMARY KEY REFERENCES pilots(id) ON DELETE CASCADE,
  source_pilot_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
  initial_backfill_done BOOLEAN NOT NULL DEFAULT FALSE,
  processed_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_cursor TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pilot_pirep_sync_state_status CHECK (
    status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED')
  )
);

CREATE INDEX IF NOT EXISTS idx_pilot_pirep_sync_state_status
ON pilot_pirep_sync_state (status);

CREATE INDEX IF NOT EXISTS idx_pilot_pirep_sync_state_source_pilot_id
ON pilot_pirep_sync_state (source_pilot_id);

CREATE OR REPLACE FUNCTION set_pilot_pirep_sync_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pilot_pirep_sync_state_updated_at ON pilot_pirep_sync_state;

CREATE TRIGGER trg_pilot_pirep_sync_state_updated_at
BEFORE UPDATE ON pilot_pirep_sync_state
FOR EACH ROW
EXECUTE FUNCTION set_pilot_pirep_sync_state_updated_at();
