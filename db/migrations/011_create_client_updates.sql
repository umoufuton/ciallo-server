CREATE TABLE IF NOT EXISTS client_releases (
  id BIGSERIAL PRIMARY KEY,
  version VARCHAR(64) NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT 'stable',
  notes TEXT NOT NULL DEFAULT '',
  pub_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  min_supported_version VARCHAR(64),
  rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, channel)
);

CREATE TABLE IF NOT EXISTS client_release_assets (
  id BIGSERIAL PRIMARY KEY,
  release_id BIGINT NOT NULL REFERENCES client_releases(id) ON DELETE CASCADE,
  platform VARCHAR(64) NOT NULL,
  arch VARCHAR(32) NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  signature TEXT,
  sha256 VARCHAR(128),
  size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (release_id, platform, arch)
);

CREATE INDEX IF NOT EXISTS idx_client_releases_channel_status_pub_date
ON client_releases (channel, status, pub_date DESC);

CREATE INDEX IF NOT EXISTS idx_client_release_assets_platform_arch
ON client_release_assets (platform, arch);

CREATE OR REPLACE FUNCTION set_client_releases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_releases_updated_at ON client_releases;

CREATE TRIGGER trg_client_releases_updated_at
BEFORE UPDATE ON client_releases
FOR EACH ROW
EXECUTE FUNCTION set_client_releases_updated_at();

CREATE OR REPLACE FUNCTION set_client_release_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_release_assets_updated_at ON client_release_assets;

CREATE TRIGGER trg_client_release_assets_updated_at
BEFORE UPDATE ON client_release_assets
FOR EACH ROW
EXECUTE FUNCTION set_client_release_assets_updated_at();
