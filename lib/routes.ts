import { getDb } from "@/lib/db";

export type ScheduledRouteRecord = {
  id: number;
  source_route_id: number;
  departure_airport_code: string;
  arrival_airport_code: string;
  route_type: string | null;
  start_date: string | null;
  end_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  callsign: string | null;
  flight_number: string | null;
  altitude: string | null;
  cost_index: number | null;
  flight_length: string | null;
  flight_distance_nm: number | null;
  service_days: string | null;
  routing: string | null;
  remarks: string | null;
  internal_remarks: string | null;
  tags: string[] | null;
  is_hidden: boolean;
  flight_rules: string | null;
  flight_type: string | null;
  allow_callsign_change: boolean;
  cs_defaults_username_opt1: boolean;
  cs_defaults_username_opt2: boolean;
  cs_defaults_aircraft_reg: boolean;
  callsign_generator_str: string | null;
  pax_lf_id: number | null;
  pax_luggage_lf_id: number | null;
  cargo_lf_id: number | null;
  cargo_volume_lf_id: number | null;
  container_ids: number[] | null;
  fleet_source_ids: number[] | null;
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
  sb_min_fob: string | null;
  sb_min_fob_units: string | null;
  sb_min_fod: string | null;
  sb_min_fod_units: string | null;
  sb_pax_wgt: string | null;
  sb_bag_wgt: string | null;
  sb_enroute_altn: string | null;
  sb_takeoff_altn: string | null;
  sb_altn_1: string | null;
  sb_altn_2: string | null;
  sb_altn_3: string | null;
  sb_altn_4: string | null;
  sb_contingency_fuel: string | null;
  sb_reserve_fuel: string | null;
  source_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduledRouteListFilters = {
  q?: string;
  departure?: string;
  arrival?: string;
  flightNumber?: string;
  callsign?: string;
  hidden?: boolean;
  sourceFleetId?: number;
  limit?: number;
};

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
}

export async function listScheduledRoutes(filters: ScheduledRouteListFilters) {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.q) {
    const index = values.push(`%${filters.q.trim()}%`);
    conditions.push(
      `(departure_airport_code ILIKE $${index} OR arrival_airport_code ILIKE $${index} OR COALESCE(flight_number, '') ILIKE $${index} OR COALESCE(callsign, '') ILIKE $${index})`,
    );
  }

  if (filters.departure) {
    const index = values.push(filters.departure.trim().toUpperCase());
    conditions.push(`UPPER(departure_airport_code) = $${index}`);
  }

  if (filters.arrival) {
    const index = values.push(filters.arrival.trim().toUpperCase());
    conditions.push(`UPPER(arrival_airport_code) = $${index}`);
  }

  if (filters.flightNumber) {
    const index = values.push(filters.flightNumber.trim().toUpperCase());
    conditions.push(`UPPER(COALESCE(flight_number, '')) = $${index}`);
  }

  if (filters.callsign) {
    const index = values.push(filters.callsign.trim().toUpperCase());
    conditions.push(`UPPER(COALESCE(callsign, '')) = $${index}`);
  }

  if (typeof filters.hidden === "boolean") {
    const index = values.push(filters.hidden);
    conditions.push(`is_hidden = $${index}`);
  }

  if (typeof filters.sourceFleetId === "number" && !Number.isNaN(filters.sourceFleetId)) {
    const index = values.push(filters.sourceFleetId);
    conditions.push(`$${index} = ANY(COALESCE(fleet_source_ids, ARRAY[]::INTEGER[]))`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(normalizeLimit(filters.limit));

  const result = await db.query<ScheduledRouteRecord>(
    `
      SELECT *
      FROM scheduled_routes
      ${whereClause}
      ORDER BY departure_airport_code ASC, arrival_airport_code ASC, flight_number ASC NULLS LAST
      LIMIT $${limitIndex}
    `,
    values,
  );

  return result.rows;
}

export async function getScheduledRouteByIdentifier(identifier: string) {
  const db = getDb();
  const normalized = identifier.trim().toUpperCase();
  const numericId = Number.parseInt(identifier, 10);

  const result = await db.query<ScheduledRouteRecord>(
    `
      SELECT *
      FROM scheduled_routes
      WHERE source_route_id::text = $1 OR UPPER(COALESCE(flight_number, '')) = $2 OR UPPER(COALESCE(callsign, '')) = $2
      ORDER BY source_route_id::text = $1 DESC
      LIMIT 1
    `,
    [identifier.trim(), normalized],
  );

  if (result.rows[0]) return result.rows[0];

  if (Number.isNaN(numericId)) {
    return null;
  }

  const byInternalId = await db.query<ScheduledRouteRecord>(
    `
      SELECT *
      FROM scheduled_routes
      WHERE id = $1
      LIMIT 1
    `,
    [numericId],
  );

  return byInternalId.rows[0] ?? null;
}
