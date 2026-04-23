import { getDb } from "@/lib/db";

export type FleetRecord = {
  id: number;
  source_fleet_id: number;
  name: string;
  type_code: string;
  type_category: string | null;
  max_passengers: number | null;
  max_freight: string | null;
  container_units: number | null;
  hide_in_phoenix: boolean;
  pirep_scoring_group_id: number | null;
  allowed_prefix_ids: string | null;
  sb_ofp_layout: string | null;
  sb_perf_code: string | null;
  sb_weight_cat: string | null;
  sb_etops_threshold: number | null;
  sb_etops_cert: string | null;
  sb_icao_equip: string | null;
  sb_icao_transponder: string | null;
  sb_pbn_capability: string | null;
  sb_extra_fpl_info: string | null;
  sb_engine_type: string | null;
  sb_pax_weight: string | null;
  sb_bag_weight: string | null;
  sb_oew: string | null;
  sb_mzfw: string | null;
  sb_mtow: string | null;
  sb_mlw: string | null;
  sb_max_fuel_cap: string | null;
  sb_contingency_fuel: string | null;
  sb_reserve_fuel: string | null;
  sb_block_fuel: string | null;
  sb_block_fuel_units: string | null;
  sb_arrival_fuel: string | null;
  sb_arrival_fuel_units: string | null;
  sb_mel_fuel: string | null;
  sb_mel_fuel_units: string | null;
  sb_atc_fuel: string | null;
  sb_atc_fuel_units: string | null;
  sb_wxx_fuel: string | null;
  sb_wxx_fuel_units: string | null;
  sb_extra_fuel: string | null;
  sb_extra_fuel_units: string | null;
  sb_tankering_fuel: string | null;
  sb_tankering_fuel_units: string | null;
  sb_fuel_factor: string | null;
  sb_service_ceiling: number | null;
  sb_cruise_profile: string | null;
  sb_cost_index: number | null;
  sb_climb_profile: string | null;
  sb_descent_profile: string | null;
  sb_altn_radius: number | null;
  sb_altn_min_ceiling: number | null;
  sb_altn_min_rwy_length: number | null;
  sb_altn_avoid_bad_wx: boolean;
  source_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type FleetListFilters = {
  q?: string;
  typeCode?: string;
  hidden?: boolean;
  limit?: number;
};

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
}

export async function listFleets(filters: FleetListFilters) {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.q) {
    const index = values.push(`%${filters.q.trim()}%`);
    conditions.push(`(name ILIKE $${index} OR type_code ILIKE $${index})`);
  }

  if (filters.typeCode) {
    const index = values.push(filters.typeCode.trim().toUpperCase());
    conditions.push(`UPPER(type_code) = $${index}`);
  }

  if (typeof filters.hidden === "boolean") {
    const index = values.push(filters.hidden);
    conditions.push(`hide_in_phoenix = $${index}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(normalizeLimit(filters.limit));

  const query = `
    SELECT *
    FROM fleets
    ${whereClause}
    ORDER BY type_code ASC, name ASC
    LIMIT $${limitIndex}
  `;

  const result = await db.query<FleetRecord>(query, values);
  return result.rows;
}

export async function getFleetByIdentifier(identifier: string) {
  const db = getDb();
  const normalized = identifier.trim().toUpperCase();
  const numericId = Number.parseInt(identifier, 10);

  const result = await db.query<FleetRecord>(
    `
      SELECT *
      FROM fleets
      WHERE source_fleet_id::text = $1 OR UPPER(type_code) = $2
      ORDER BY source_fleet_id::text = $1 DESC
      LIMIT 1
    `,
    [identifier.trim(), normalized],
  );

  if (result.rows[0]) return result.rows[0];

  if (Number.isNaN(numericId)) {
    return null;
  }

  const byInternalId = await db.query<FleetRecord>(
    `
      SELECT *
      FROM fleets
      WHERE id = $1
      LIMIT 1
    `,
    [numericId],
  );

  return byInternalId.rows[0] ?? null;
}
