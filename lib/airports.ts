import { getDb } from "@/lib/db";

export type AirportRecord = {
  id: number;
  icao_code: string;
  iata_code: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
  country_iso2: string | null;
  country_name: string | null;
  category: string | null;
  is_base: boolean;
  is_suitable_alternate: boolean;
  airport_briefing_url: string | null;
  taxi_in_minutes: number | null;
  taxi_out_minutes: number | null;
  preferred_alternates: string | null;
  sb_alt_radius: number | null;
  sb_alt_min_ceiling: number | null;
  sb_alt_min_rwy_length: number | null;
  sb_alt_avoid_bad_weather: boolean;
  sb_alt_exclude_airports: string | null;
  sb_takeoff_alt_code: string | null;
  sb_alt_1_code: string | null;
  sb_alt_2_code: string | null;
  sb_alt_3_code: string | null;
  sb_alt_4_code: string | null;
  passenger_lf_id: number | null;
  luggage_lf_id: number | null;
  cargo_weight_lf_id: number | null;
  cargo_volume_lf_id: number | null;
  container_ids: string | null;
  source_deleted: boolean;
  source_airport_id: number | null;
  source_airport_icao: string | null;
  source_airport_iata: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AirportListFilters = {
  q?: string;
  base?: boolean;
  alternate?: boolean;
  limit?: number;
};

export type AirportMapRecord = {
  icao: string;
  iata: string | null;
  name: string;
  lat: number;
  lon: number;
  base: boolean;
  category: string | null;
  updated_at: string;
};

export type AirportMapBboxFilters = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  zoom?: number;
  limit?: number;
};

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
}

function normalizeMapLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 500;
  return Math.min(Math.max(limit, 1), 2000);
}

function getGridSizeForZoom(zoom?: number) {
  if (zoom === undefined || Number.isNaN(zoom)) return 1;
  if (zoom < 4) return 10;
  if (zoom < 6) return 3;
  if (zoom < 8) return 1;
  return 0;
}

function getPerBucketForZoom(zoom?: number) {
  if (zoom === undefined || Number.isNaN(zoom)) return 4;
  if (zoom < 4) return 2;
  if (zoom < 6) return 3;
  if (zoom < 8) return 4;
  return 0;
}

export async function listAirports(filters: AirportListFilters) {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.q) {
    const index = values.push(`%${filters.q.trim()}%`);
    conditions.push(
      `(icao_code ILIKE $${index} OR COALESCE(iata_code, '') ILIKE $${index} OR name ILIKE $${index})`,
    );
  }

  if (typeof filters.base === "boolean") {
    const index = values.push(filters.base);
    conditions.push(`is_base = $${index}`);
  }

  if (typeof filters.alternate === "boolean") {
    const index = values.push(filters.alternate);
    conditions.push(`is_suitable_alternate = $${index}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(normalizeLimit(filters.limit));

  const query = `
    SELECT *
    FROM airports
    ${whereClause}
    ORDER BY icao_code ASC
    LIMIT $${limitIndex}
  `;

  const result = await db.query<AirportRecord>(query, values);
  return result.rows;
}

export async function getAirportByCode(code: string) {
  const db = getDb();
  const normalized = code.trim().toUpperCase();
  const result = await db.query<AirportRecord>(
    `
      SELECT *
      FROM airports
      WHERE UPPER(icao_code) = $1 OR UPPER(COALESCE(iata_code, '')) = $1
      LIMIT 1
    `,
    [normalized],
  );

  return result.rows[0] ?? null;
}

export async function getAirportMapIndexVersion() {
  const db = getDb();
  const result = await db.query<{ count: number; max_updated_at: string | null }>(
    `
      SELECT
        COUNT(*)::int AS count,
        MAX(updated_at)::text AS max_updated_at
      FROM airports
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
    `,
  );

  const row = result.rows[0] ?? { count: 0, max_updated_at: null };
  const version = `${row.count}:${row.max_updated_at ?? "none"}`;
  return {
    count: row.count,
    maxUpdatedAt: row.max_updated_at,
    version,
    etag: `"airports-map-index-${Buffer.from(version).toString("base64url")}"`,
  };
}

export async function listAirportMapIndex() {
  const db = getDb();
  const result = await db.query<AirportMapRecord>(
    `
      SELECT
        icao_code AS icao,
        iata_code AS iata,
        name,
        latitude AS lat,
        longitude AS lon,
        is_base AS base,
        category,
        updated_at::text AS updated_at
      FROM airports
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY
        is_base DESC,
        CASE LOWER(COALESCE(category, ''))
          WHEN 'large_airport' THEN 0
          WHEN 'international' THEN 0
          WHEN 'medium_airport' THEN 1
          WHEN 'domestic' THEN 1
          ELSE 2
        END,
        icao_code ASC
    `,
  );

  return result.rows;
}

export async function listAirportMapBbox(filters: AirportMapBboxFilters) {
  const db = getDb();
  const limit = normalizeMapLimit(filters.limit);
  const gridSize = getGridSizeForZoom(filters.zoom);
  const perBucket = getPerBucketForZoom(filters.zoom);
  const crossesDateLine = filters.minLon > filters.maxLon;

  const longitudeCondition = crossesDateLine
    ? "(longitude >= $1 OR longitude <= $3)"
    : "longitude BETWEEN $1 AND $3";

  const values = [
    filters.minLon,
    filters.minLat,
    filters.maxLon,
    filters.maxLat,
    limit + 1,
  ];

  const baseQuery = `
    SELECT
      icao_code AS icao,
      iata_code AS iata,
      name,
      latitude AS lat,
      longitude AS lon,
      is_base AS base,
      category,
      updated_at::text AS updated_at,
      CASE LOWER(COALESCE(category, ''))
        WHEN 'large_airport' THEN 0
        WHEN 'international' THEN 0
        WHEN 'medium_airport' THEN 1
        WHEN 'domestic' THEN 1
        ELSE 2
      END AS category_priority
    FROM airports
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude BETWEEN $2 AND $4
      AND ${longitudeCondition}
  `;

  if (gridSize <= 0 || perBucket <= 0) {
    const result = await db.query<AirportMapRecord>(
      `
        SELECT icao, iata, name, lat, lon, base, category, updated_at
        FROM (${baseQuery}) airports_in_bbox
        ORDER BY base DESC, category_priority ASC, icao ASC
        LIMIT $5
      `,
      values,
    );
    return {
      airports: result.rows.slice(0, limit),
      truncated: result.rows.length > limit,
    };
  }

  values.push(gridSize, perBucket);
  const result = await db.query<AirportMapRecord>(
    `
      WITH ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY FLOOR(lat / $6), FLOOR(lon / $6)
            ORDER BY base DESC, category_priority ASC, icao ASC
          ) AS bucket_rank
        FROM (${baseQuery}) airports_in_bbox
      )
      SELECT icao, iata, name, lat, lon, base, category, updated_at
      FROM ranked
      WHERE bucket_rank <= $7
      ORDER BY base DESC, category_priority ASC, icao ASC
      LIMIT $5
    `,
    values,
  );

  return {
    airports: result.rows.slice(0, limit),
    truncated: result.rows.length > limit,
  };
}
