import { getDb } from "@/lib/db";

export type ReleaseStatus = "draft" | "published" | "archived";

export type ReleaseAssetInput = {
  platform: string;
  arch?: string | null;
  url: string;
  signature?: string | null;
  sha256?: string | null;
  size?: number | null;
};

export type UpsertClientReleaseInput = {
  version: string;
  channel?: string;
  notes?: string;
  pubDate?: string | null;
  mandatory?: boolean;
  minSupportedVersion?: string | null;
  rolloutPercent?: number;
  status?: ReleaseStatus;
  assets: ReleaseAssetInput[];
};

type ReleaseAssetRow = {
  id: number;
  release_id: number;
  platform: string;
  arch: string;
  url: string;
  signature: string | null;
  sha256: string | null;
  size: string | null;
};

type ReleaseRow = {
  id: number;
  version: string;
  channel: string;
  notes: string;
  pub_date: string;
  mandatory: boolean;
  min_supported_version: string | null;
  rollout_percent: number;
  status: ReleaseStatus;
  created_at: string;
  updated_at: string;
};

type ReleaseWithAssetRow = ReleaseRow &
  Pick<ReleaseAssetRow, "platform" | "arch" | "url" | "signature" | "sha256" | "size">;

type VersionParts = {
  core: number[];
  prerelease: string;
};

export type ClientUpdateCheckParams = {
  currentVersion: string;
  platform: string;
  arch?: string | null;
  channel?: string | null;
  rolloutSeed?: string | null;
};

export type ClientUpdateCheckResult =
  | {
      hasUpdate: false;
      currentVersion: string;
      channel: string;
      platform: string;
      arch: string;
      checkedAt: string;
    }
  | {
      hasUpdate: true;
      currentVersion: string;
      channel: string;
      platform: string;
      arch: string;
      checkedAt: string;
      release: {
        id: number;
        version: string;
        notes: string;
        pubDate: string;
        mandatory: boolean;
        minSupportedVersion: string | null;
        rolloutPercent: number;
      };
      download: {
        platform: string;
        arch: string;
        url: string;
        signature: string | null;
        sha256: string | null;
        size: number | null;
      };
    };

export type ClientReleaseListItem = {
  id: number;
  version: string;
  channel: string;
  notes: string;
  pub_date: string;
  mandatory: boolean;
  min_supported_version: string | null;
  rollout_percent: number;
  status: ReleaseStatus;
  created_at: string;
  updated_at: string;
  assets: Array<{
    id: number;
    platform: string;
    arch: string;
    url: string;
    signature: string | null;
    sha256: string | null;
    size: number | null;
  }>;
};

export type TauriPlatformManifest = {
  signature: string;
  url: string;
};

export type TauriLatestManifest = {
  version: string;
  notes?: string;
  pub_date?: string;
  platforms: Record<string, TauriPlatformManifest>;
};

function toRfc3339(value: string | null | undefined) {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;

  // PostgreSQL text cast often returns "YYYY-MM-DD HH:mm:ss+08".
  // Tauri updater expects RFC3339, so normalize to an ISO-like form.
  const normalized = text.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  // Keep timezone offset normalization deterministic for updater parser.
  return normalized;
}

function normalizedChannel(value?: string | null) {
  const text = value?.trim().toLowerCase();
  return text && text.length > 0 ? text : "stable";
}

function normalizedArch(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizedVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function parseVersion(value: string): VersionParts {
  const normalized = normalizedVersion(value);
  const [coreText, prerelease = ""] = normalized.split("-", 2);
  const core = coreText
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .slice(0, 4);

  while (core.length < 4) core.push(0);
  return { core, prerelease };
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  for (let index = 0; index < Math.max(a.core.length, b.core.length); index += 1) {
    const diff = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

function hashToPercentBucket(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function withinRollout(rolloutPercent: number, rolloutSeed?: string | null) {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  if (!rolloutSeed || rolloutSeed.trim().length === 0) return false;
  return hashToPercentBucket(rolloutSeed.trim()) < rolloutPercent;
}

function parseNullableNumber(value: string | null) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAssetInput(input: ReleaseAssetInput) {
  const platform = input.platform.trim().toLowerCase();
  const arch = normalizedArch(input.arch);
  const url = input.url.trim();
  const signature = input.signature?.trim() || null;
  const sha256 = input.sha256?.trim() || null;
  const size =
    typeof input.size === "number" && Number.isFinite(input.size)
      ? Math.max(0, Math.floor(input.size))
      : null;

  if (!platform) throw new Error("asset.platform is required");
  if (!url) throw new Error("asset.url is required");

  return { platform, arch, url, signature, sha256, size };
}

function toReleaseStatus(value?: string | null): ReleaseStatus {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "draft") return "draft";
  if (normalized === "published") return "published";
  if (normalized === "archived") return "archived";
  throw new Error("status must be draft, published, or archived");
}

export async function checkClientUpdate(params: ClientUpdateCheckParams): Promise<ClientUpdateCheckResult> {
  const currentVersion = normalizedVersion(params.currentVersion);
  const platform = params.platform.trim().toLowerCase();
  const arch = normalizedArch(params.arch);
  const channel = normalizedChannel(params.channel);

  if (!currentVersion) throw new Error("currentVersion is required");
  if (!platform) throw new Error("platform is required");

  const db = getDb();
  const rows = await db.query<ReleaseWithAssetRow>(
    `
      SELECT
        r.id,
        r.version,
        r.channel,
        r.notes,
        r.pub_date::text,
        r.mandatory,
        r.min_supported_version,
        r.rollout_percent,
        r.status,
        r.created_at::text,
        r.updated_at::text,
        a.platform,
        a.arch,
        a.url,
        a.signature,
        a.sha256,
        a.size::text
      FROM client_releases r
      JOIN client_release_assets a ON a.release_id = r.id
      WHERE r.status = 'published'
        AND r.channel = $1
        AND a.platform = $2
        AND ($3 = '' OR a.arch = $3 OR a.arch = '')
      ORDER BY r.pub_date DESC, r.id DESC
    `,
    [channel, platform, arch],
  );

  const releaseMap = new Map<number, ReleaseWithAssetRow>();
  for (const row of rows.rows) {
    const existing = releaseMap.get(row.id);
    if (!existing) {
      releaseMap.set(row.id, row);
      continue;
    }

    const existingExact = existing.arch === arch;
    const nextExact = row.arch === arch;
    if (!existingExact && nextExact) {
      releaseMap.set(row.id, row);
    }
  }

  let selected: ReleaseWithAssetRow | null = null;
  for (const row of releaseMap.values()) {
    if (compareVersions(row.version, currentVersion) <= 0) continue;
    if (!withinRollout(row.rollout_percent, params.rolloutSeed)) continue;
    if (!selected || compareVersions(row.version, selected.version) > 0) {
      selected = row;
    }
  }

  if (!selected) {
    return {
      hasUpdate: false,
      currentVersion,
      channel,
      platform,
      arch,
      checkedAt: new Date().toISOString(),
    };
  }

  const minSupportedVersion = selected.min_supported_version;
  const mandatory =
    selected.mandatory ||
    (minSupportedVersion != null && compareVersions(currentVersion, minSupportedVersion) < 0);

  return {
    hasUpdate: true,
    currentVersion,
    channel,
    platform,
    arch,
    checkedAt: new Date().toISOString(),
    release: {
      id: selected.id,
      version: selected.version,
      notes: selected.notes,
      pubDate: selected.pub_date,
      mandatory,
      minSupportedVersion,
      rolloutPercent: selected.rollout_percent,
    },
    download: {
      platform: selected.platform,
      arch: selected.arch,
      url: selected.url,
      signature: selected.signature,
      sha256: selected.sha256,
      size: parseNullableNumber(selected.size),
    },
  };
}

export async function listClientReleases(params?: {
  channel?: string;
  status?: ReleaseStatus | null;
  limit?: number;
}): Promise<ClientReleaseListItem[]> {
  const db = getDb();
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (params?.channel) {
    values.push(params.channel.trim().toLowerCase());
    conditions.push(`r.channel = $${values.length}`);
  }

  if (params?.status) {
    values.push(params.status);
    conditions.push(`r.status = $${values.length}`);
  }

  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
  values.push(limit);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db.query<
    ReleaseRow & {
      assets: string;
    }
  >(
    `
      SELECT
        r.id,
        r.version,
        r.channel,
        r.notes,
        r.pub_date::text,
        r.mandatory,
        r.min_supported_version,
        r.rollout_percent,
        r.status,
        r.created_at::text,
        r.updated_at::text,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'platform', a.platform,
              'arch', a.arch,
              'url', a.url,
              'signature', a.signature,
              'sha256', a.sha256,
              'size', a.size
            )
            ORDER BY a.platform ASC, a.arch ASC
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'::json
        )::text AS assets
      FROM client_releases r
      LEFT JOIN client_release_assets a ON a.release_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY r.pub_date DESC, r.id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return rows.rows.map((row: ReleaseRow & { assets: string }) => ({
    id: row.id,
    version: row.version,
    channel: row.channel,
    notes: row.notes,
    pub_date: row.pub_date,
    mandatory: row.mandatory,
    min_supported_version: row.min_supported_version,
    rollout_percent: row.rollout_percent,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assets: JSON.parse(row.assets) as Array<{
      id: number;
      platform: string;
      arch: string;
      url: string;
      signature: string | null;
      sha256: string | null;
      size: number | null;
    }>,
  }));
}

export async function upsertClientReleaseWithAssets(input: UpsertClientReleaseInput) {
  const db = getDb();
  const client = await db.connect();

  const version = normalizedVersion(input.version);
  const channel = normalizedChannel(input.channel);
  const notes = input.notes ?? "";
  const mandatory = Boolean(input.mandatory);
  const status = toReleaseStatus(input.status);
  const rolloutPercent = Math.min(Math.max(Math.floor(input.rolloutPercent ?? 100), 0), 100);
  const minSupportedVersion = input.minSupportedVersion?.trim() || null;
  const pubDate = input.pubDate?.trim() || null;
  const assets = (input.assets ?? []).map(normalizeAssetInput);

  if (!version) throw new Error("version is required");
  if (assets.length === 0) throw new Error("assets is required and cannot be empty");

  try {
    await client.query("BEGIN");

    const release = await client.query<ReleaseRow>(
      `
        INSERT INTO client_releases (
          version, channel, notes, pub_date, mandatory, min_supported_version, rollout_percent, status
        ) VALUES (
          $1, $2, $3, COALESCE($4::timestamptz, NOW()), $5, $6, $7, $8
        )
        ON CONFLICT (version, channel)
        DO UPDATE SET
          notes = EXCLUDED.notes,
          pub_date = EXCLUDED.pub_date,
          mandatory = EXCLUDED.mandatory,
          min_supported_version = EXCLUDED.min_supported_version,
          rollout_percent = EXCLUDED.rollout_percent,
          status = EXCLUDED.status
        RETURNING *
      `,
      [version, channel, notes, pubDate, mandatory, minSupportedVersion, rolloutPercent, status],
    );

    const releaseId = release.rows[0]?.id;
    if (!releaseId) throw new Error("failed to upsert release");

    await client.query("DELETE FROM client_release_assets WHERE release_id = $1", [releaseId]);

    for (const asset of assets) {
      await client.query(
        `
          INSERT INTO client_release_assets (
            release_id, platform, arch, url, signature, sha256, size
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
        `,
        [releaseId, asset.platform, asset.arch, asset.url, asset.signature, asset.sha256, asset.size],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const releases = await listClientReleases({ channel, limit: 1 });
  return releases.find((item: ClientReleaseListItem) => item.version === version && item.channel === channel) ?? null;
}

function toTauriTarget(platform: string, arch: string) {
  const normalizedPlatform = platform.trim().toLowerCase();
  const normalizedArch = arch.trim().toLowerCase();

  if (normalizedPlatform === "windows") {
    if (normalizedArch === "arm64") return "windows-aarch64";
    return "windows-x86_64";
  }

  if (normalizedPlatform === "linux") {
    if (normalizedArch === "arm64") return "linux-aarch64";
    return "linux-x86_64";
  }

  if (normalizedPlatform === "macos" || normalizedPlatform === "darwin" || normalizedPlatform === "mac") {
    if (normalizedArch === "arm64") return "darwin-aarch64";
    return "darwin-x86_64";
  }

  return null;
}

export async function buildLatestTauriManifest(params?: {
  channel?: string | null;
}): Promise<TauriLatestManifest | null> {
  const releases = await listClientReleases({
    channel: params?.channel ?? "stable",
    status: "published",
    limit: 1,
  });
  const latest = releases[0];
  if (!latest) return null;

  const platforms: Record<string, TauriPlatformManifest> = {};

  for (const asset of latest.assets) {
    const target = toTauriTarget(asset.platform, asset.arch);
    const signature = asset.signature?.trim() ?? "";
    const url = asset.url?.trim() ?? "";
    if (!target || !signature || !url) continue;
    platforms[target] = { signature, url };
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error("no valid signed assets found for tauri updater");
  }

  return {
    version: latest.version,
    notes: latest.notes || undefined,
    pub_date: toRfc3339(latest.pub_date),
    platforms,
  };
}
