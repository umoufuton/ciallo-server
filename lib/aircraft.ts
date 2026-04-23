import { getDb } from "@/lib/db";

export type AircraftRecord = {
  id: number;
  source_aircraft_id: number;
  name: string;
  registration: string;
  selcal: string | null;
  fin_number: string | null;
  hex_code: string | null;
  fleet_id: number | null;
  source_fleet_id: number | null;
  passengers: number | null;
  freight: string | null;
  container_units: number | null;
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
  internal_remarks: string | null;
  source_deleted: boolean;
  created_at: string;
  updated_at: string;
  fleet_source_fleet_id: number | null;
  fleet_name: string | null;
  fleet_type_code: string | null;
};

export type AircraftListFilters = {
  q?: string;
  fleetId?: number;
  sourceFleetId?: number;
  typeCode?: string;
  limit?: number;
};

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
}

const aircraftSelect = `
  SELECT
    a.*,
    f.source_fleet_id AS fleet_source_fleet_id,
    f.name AS fleet_name,
    f.type_code AS fleet_type_code
  FROM aircraft a
  LEFT JOIN fleets f ON a.fleet_id = f.id
`;

export async function listAircraft(filters: AircraftListFilters) {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.q) {
    const index = values.push(`%${filters.q.trim()}%`);
    conditions.push(`(a.registration ILIKE $${index} OR a.name ILIKE $${index} OR COALESCE(a.selcal, '') ILIKE $${index})`);
  }

  if (typeof filters.fleetId === "number" && !Number.isNaN(filters.fleetId)) {
    const index = values.push(filters.fleetId);
    conditions.push(`a.fleet_id = $${index}`);
  }

  if (typeof filters.sourceFleetId === "number" && !Number.isNaN(filters.sourceFleetId)) {
    const index = values.push(filters.sourceFleetId);
    conditions.push(`a.source_fleet_id = $${index}`);
  }

  if (filters.typeCode) {
    const index = values.push(filters.typeCode.trim().toUpperCase());
    conditions.push(`UPPER(COALESCE(f.type_code, '')) = $${index}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(normalizeLimit(filters.limit));

  const result = await db.query<AircraftRecord>(
    `
      ${aircraftSelect}
      ${whereClause}
      ORDER BY a.registration ASC
      LIMIT $${limitIndex}
    `,
    values,
  );

  return result.rows;
}

export async function getAircraftByIdentifier(identifier: string) {
  const db = getDb();
  const normalized = identifier.trim().toUpperCase();
  const numericId = Number.parseInt(identifier, 10);

  const byRegistrationOrSourceId = await db.query<AircraftRecord>(
    `
      ${aircraftSelect}
      WHERE UPPER(a.registration) = $1 OR a.source_aircraft_id::text = $2
      ORDER BY UPPER(a.registration) = $1 DESC
      LIMIT 1
    `,
    [normalized, identifier.trim()],
  );

  if (byRegistrationOrSourceId.rows[0]) {
    return byRegistrationOrSourceId.rows[0];
  }

  if (Number.isNaN(numericId)) {
    return null;
  }

  const byInternalId = await db.query<AircraftRecord>(
    `
      ${aircraftSelect}
      WHERE a.id = $1
      LIMIT 1
    `,
    [numericId],
  );

  return byInternalId.rows[0] ?? null;
}
