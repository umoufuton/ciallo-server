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

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
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
