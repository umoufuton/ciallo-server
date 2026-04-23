import { getDb } from "@/lib/db";
import type { QueryResultRow } from "pg";

type Queryable = {
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

export type PirepRecord = {
  id: number;
  source_pirep_id: number | null;
  pilot_id: number;
  source_pilot_id: number | null;
  airline_id: number | null;
  user_id: number | null;
  username: string | null;
  callsign: string | null;
  flight_number: string | null;
  status: string | null;
  type: string | null;
  network: string | null;
  booking_id: number | null;
  route_id: number | null;
  departure_airport_id: number | null;
  arrival_airport_id: number | null;
  departure_airport_code: string | null;
  arrival_airport_code: string | null;
  aircraft_id: number | null;
  fleet_id: number | null;
  livery_id: number | null;
  aircraft_registration: string | null;
  aircraft_type_code: string | null;
  landing_rate: number | null;
  landing_g: number | null;
  flight_distance: number | null;
  flight_length: number | null;
  block_length: number | null;
  credited_time: number | null;
  fuel_used: number | null;
  points: number | null;
  bonus_sum: number | null;
  booking_type: string | null;
  internal_note: string | null;
  simulator_version: string | null;
  acars_version: string | null;
  off_blocks_time: string | null;
  departure_time: string | null;
  landing_time: string | null;
  on_blocks_time: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  raw_log: unknown | null;
  raw_pirep_data: unknown | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type PirepSummaryRecord = Pick<
  PirepRecord,
  | "id"
  | "source_pirep_id"
  | "pilot_id"
  | "source_pilot_id"
  | "username"
  | "callsign"
  | "flight_number"
  | "status"
  | "type"
  | "network"
  | "aircraft_registration"
  | "aircraft_type_code"
  | "departure_airport_code"
  | "arrival_airport_code"
  | "flight_distance"
  | "flight_length"
  | "block_length"
  | "landing_rate"
  | "landing_g"
  | "off_blocks_time"
  | "departure_time"
  | "landing_time"
  | "on_blocks_time"
  | "source_created_at"
  | "created_at"
  | "updated_at"
> & {
  route: string | null;
  pilot_route: string | null;
};

export type PirepListRecord = Pick<
  PirepRecord,
  | "id"
  | "source_pirep_id"
  | "callsign"
  | "flight_number"
  | "status"
  | "aircraft_registration"
  | "aircraft_type_code"
  | "departure_airport_code"
  | "arrival_airport_code"
  | "landing_rate"
  | "source_created_at"
  | "created_at"
>;

export type PilotPirepStats = {
  total_flights: number;
  accepted_flights: number;
  rejected_flights: number;
  total_flight_seconds: number;
  total_block_seconds: number;
  total_credited_seconds: number;
  total_distance_nm: number;
  total_fuel_used: number;
  average_landing_rate: number | null;
  average_landing_g: number | null;
  average_distance_nm: number | null;
  average_flight_seconds: number | null;
  total_points: number;
  total_bonus_points: number;
  last_flight_time: string | null;
};

export type PirepTrackPoint = {
  timestamp: string;
  phase: string;
  latitude: number;
  longitude: number;
  altitude: number;
  indicated_airspeed: number;
  ground_speed: number;
  vertical_speed: number;
  heading: number;
  fuel_on_board: number;
  on_ground: boolean;
};

export type PirepLogEvent = {
  kind: string;
  description: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type IncomingPirepPayload = {
  [key: string]: unknown;
};

type UpsertPirepInput = {
  pilotId: number;
  fallbackUsername: string;
  payload: IncomingPirepPayload;
  db?: Queryable;
};

const jsonColumns = new Set(["raw_log", "raw_pirep_data", "raw_payload"]);

function safeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return null;

  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return value;
  if (valueType === "number") {
    return Number.isFinite(value as number) ? value : null;
  }
  if (valueType === "bigint") return String(value);
  if (valueType === "function" || valueType === "symbol" || valueType === "undefined") {
    return null;
  }

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => safeJsonValue(item, seen));
  }

  if (valueType === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[Circular]";
    seen.add(obj);

    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      const safe = safeJsonValue(entry, seen);
      if (safe !== undefined) next[key] = safe;
    }
    seen.delete(obj);
    return next;
  }

  return null;
}

function toJsonText(value: unknown): string {
  const safe = safeJsonValue(value);
  try {
    return JSON.stringify(safe ?? null);
  } catch {
    return JSON.stringify({ serialization_error: true });
  }
}

function parseUnknownJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const parsed = parseUnknownJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toIsoLikeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.includes("T")) return normalized;
  return `${normalized.replace(" ", "T")}${normalized.includes("+") ? "" : "Z"}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

function toTimestamp(value: unknown): string | null {
  const text = toStringValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString();
}

function unwrapPirepPayload(input: IncomingPirepPayload) {
  const nestedData =
    input && typeof input.data === "object" && input.data !== null
      ? (input.data as IncomingPirepPayload)
      : null;
  return nestedData ?? input;
}

function airportCodeFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const code = toStringValue(record.icao) ?? toStringValue(record.iata);
  return code ? code.toUpperCase() : null;
}

function pickAirportCode(root: IncomingPirepPayload, airportKey: "departure_airport" | "arrival_airport", icaoKey: "departure_icao" | "arrival_icao") {
  const fromObject = airportCodeFromObject(root[airportKey]);
  if (fromObject) return fromObject;
  const fromIcao = toStringValue(root[icaoKey]);
  return fromIcao ? fromIcao.toUpperCase() : null;
}

function pickEnvironmentField(root: IncomingPirepPayload, key: string): string | null {
  const env = root.environment;
  if (!env || typeof env !== "object") return null;
  return toStringValue((env as Record<string, unknown>)[key]);
}

function pickNestedString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = toStringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function normalizePayload(input: UpsertPirepInput) {
  const root = unwrapPirepPayload(input.payload);
  const pilotFromPayload =
    root.pilot && typeof root.pilot === "object" ? (root.pilot as Record<string, unknown>) : null;
  const aircraftFromPayload =
    root.aircraft && typeof root.aircraft === "object" ? (root.aircraft as Record<string, unknown>) : null;
  const environmentFromPayload =
    root.environment && typeof root.environment === "object"
      ? (root.environment as Record<string, unknown>)
      : null;

  const username =
    toStringValue(root.username) ??
    toStringValue(pilotFromPayload?.username) ??
    input.fallbackUsername;

  return {
    source_pirep_id: toNumber(root.id),
    pilot_id: input.pilotId,
    source_pilot_id: toNumber(root.pilot_id) ?? toNumber(pilotFromPayload?.id),
    airline_id: toNumber(root.airline_id),
    user_id: toNumber(root.user_id) ?? toNumber(pilotFromPayload?.user_id),
    username,
    callsign: toStringValue(root.callsign) ?? toStringValue(root.flight_number),
    flight_number: toStringValue(root.flight_number),
    status: toStringValue(root.status),
    type: toStringValue(root.type),
    network: toStringValue(root.network),
    booking_id: toNumber(root.booking_id),
    route_id: toNumber(root.route_id),
    departure_airport_id: toNumber(root.departure_airport_id),
    arrival_airport_id: toNumber(root.arrival_airport_id),
    departure_airport_code: pickAirportCode(root, "departure_airport", "departure_icao"),
    arrival_airport_code: pickAirportCode(root, "arrival_airport", "arrival_icao"),
    aircraft_id: toNumber(root.aircraft_id),
    fleet_id: toNumber(root.fleet_id),
    livery_id: toNumber(root.livery_id),
    aircraft_registration:
      pickNestedString(aircraftFromPayload, ["registration", "tail_number"]) ??
      toStringValue(root.registration) ??
      toStringValue(root.tail_number),
    aircraft_type_code:
      pickNestedString(aircraftFromPayload, ["icao", "icao_code", "type", "name"]) ??
      toStringValue(root.aircraft_type) ??
      toStringValue(root.type) ??
      pickNestedString(environmentFromPayload, ["aircraft_type", "aircraft_title"]),
    landing_rate: toNumber(root.landing_rate),
    landing_g: toNumber(root.landing_g),
    flight_distance: toNumber(root.flight_distance),
    flight_length: toNumber(root.flight_length),
    block_length: toNumber(root.block_length),
    credited_time: toNumber(root.credited_time),
    fuel_used: toNumber(root.fuel_used),
    points: toNumber(root.points),
    bonus_sum: toNumber(root.bonus_sum),
    booking_type: toStringValue(root.booking_type),
    internal_note: toStringValue(root.internal_note),
    simulator_version: toStringValue(root.simulator_version) ?? pickEnvironmentField(root, "simulator_version"),
    acars_version: toStringValue(root.acars_version) ?? pickEnvironmentField(root, "addon_name"),
    off_blocks_time: toTimestamp(root.off_blocks_time),
    departure_time: toTimestamp(root.departure_time),
    landing_time: toTimestamp(root.landing_time),
    on_blocks_time: toTimestamp(root.on_blocks_time),
    source_created_at: toTimestamp(root.created_at),
    source_updated_at: toTimestamp(root.updated_at),
    raw_log: Array.isArray(root.log) ? root.log : Array.isArray(root.events) ? root.events : root.log ?? root.events ?? null,
    raw_pirep_data: root.pirep_data ?? root.position_reports ?? null,
    raw_payload: input.payload,
  };
}

const writableColumns = [
  "source_pirep_id",
  "pilot_id",
  "source_pilot_id",
  "airline_id",
  "user_id",
  "username",
  "callsign",
  "flight_number",
  "status",
  "type",
  "network",
  "booking_id",
  "route_id",
  "departure_airport_id",
  "arrival_airport_id",
  "departure_airport_code",
  "arrival_airport_code",
  "aircraft_id",
  "fleet_id",
  "livery_id",
  "aircraft_registration",
  "aircraft_type_code",
  "landing_rate",
  "landing_g",
  "flight_distance",
  "flight_length",
  "block_length",
  "credited_time",
  "fuel_used",
  "points",
  "bonus_sum",
  "booking_type",
  "internal_note",
  "simulator_version",
  "acars_version",
  "off_blocks_time",
  "departure_time",
  "landing_time",
  "on_blocks_time",
  "source_created_at",
  "source_updated_at",
  "raw_log",
  "raw_pirep_data",
  "raw_payload",
] as const;

function buildInsertStatement() {
  const placeholders = writableColumns
    .map((column, index) => {
      const placeholder = `$${index + 1}`;
      return jsonColumns.has(column) ? `${placeholder}::jsonb` : placeholder;
    })
    .join(", ");
  return `
    INSERT INTO pireps (${writableColumns.join(", ")})
    VALUES (${placeholders})
    RETURNING *
  `;
}

function buildUpdateStatement() {
  const assignments = writableColumns
    .filter((column) => column !== "pilot_id")
    .map((column, index) => {
      const placeholder = `$${index + 1}`;
      return `${column} = ${jsonColumns.has(column) ? `${placeholder}::jsonb` : placeholder}`;
    })
    .join(", ");

  return `
    UPDATE pireps
    SET ${assignments}
    WHERE id = $${writableColumns.length}
    RETURNING *
  `;
}

export async function upsertPilotPirep(input: UpsertPirepInput) {
  const db = input.db ?? getDb();
  const normalized = normalizePayload(input);
  const values = writableColumns.map((column) =>
    jsonColumns.has(column) ? toJsonText(normalized[column]) : normalized[column]
  );

  if (!normalized.source_pirep_id) {
    const inserted = await db.query<PirepRecord>(buildInsertStatement(), values);
    return inserted.rows[0] ?? null;
  }

  const existing = await db.query<{ id: number; pilot_id: number }>(
    `
      SELECT id, pilot_id
      FROM pireps
      WHERE source_pirep_id = $1
      LIMIT 1
    `,
    [normalized.source_pirep_id],
  );

  if (!existing.rows[0]) {
    const inserted = await db.query<PirepRecord>(buildInsertStatement(), values);
    return inserted.rows[0] ?? null;
  }

  if (existing.rows[0].pilot_id !== input.pilotId) {
    throw new Error("pirep_source_id_conflict");
  }

  const updateValues = [...values.filter((_, index) => writableColumns[index] !== "pilot_id"), existing.rows[0].id];
  const updated = await db.query<PirepRecord>(buildUpdateStatement(), updateValues);
  return updated.rows[0] ?? null;
}

export async function listPilotPireps(params: {
  pilotId: number;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const conditions: string[] = ["pilot_id = $1"];
  const values: unknown[] = [params.pilotId];

  if (params.status) {
    const index = values.push(params.status.trim().toLowerCase());
    conditions.push(`LOWER(COALESCE(status, '')) = $${index}`);
  }

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const limitIndex = values.push(limit);
  const offsetIndex = values.push(offset);
  const rows = await db.query<PirepListRecord>(
    `
      SELECT
        id,
        source_pirep_id,
        callsign,
        flight_number,
        status,
        aircraft_registration,
        aircraft_type_code,
        departure_airport_code,
        arrival_airport_code,
        landing_rate,
        source_created_at,
        created_at
      FROM pireps
      WHERE ${conditions.join(" AND ")}
      ORDER BY COALESCE(on_blocks_time, source_created_at, created_at) DESC, id DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `,
    values,
  );

  return rows.rows;
}

export async function countPilotPireps(params: {
  pilotId: number;
  status?: string;
}) {
  const db = getDb();
  const conditions: string[] = ["pilot_id = $1"];
  const values: unknown[] = [params.pilotId];

  if (params.status) {
    const index = values.push(params.status.trim().toLowerCase());
    conditions.push(`LOWER(COALESCE(status, '')) = $${index}`);
  }

  const result = await db.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM pireps
      WHERE ${conditions.join(" AND ")}
    `,
    values,
  );

  const raw = result.rows[0]?.total ?? "0";
  const total = Number.parseInt(raw, 10);
  return Number.isFinite(total) ? total : 0;
}

export async function getPilotPirepByIdentifier(params: {
  pilotId: number;
  identifier: string;
}) {
  return queryPilotPirepByIdentifier<PirepRecord>({
    pilotId: params.pilotId,
    identifier: params.identifier,
    selectColumns: "*",
  });
}

async function queryPilotPirepByIdentifier<T extends QueryResultRow>(params: {
  pilotId: number;
  identifier: string;
  selectColumns: string;
}) {
  const db = getDb();
  const trimmed = params.identifier.trim();
  const numericId = Number.parseInt(trimmed, 10);

  if (!Number.isNaN(numericId)) {
    const bySourceOrId = await db.query<T>(
      `
        SELECT ${params.selectColumns}
        FROM pireps
        WHERE pilot_id = $1
          AND (source_pirep_id = $2 OR id = $2)
        ORDER BY source_pirep_id = $2 DESC
        LIMIT 1
      `,
      [params.pilotId, numericId],
    );

    if (bySourceOrId.rows[0]) {
      return bySourceOrId.rows[0];
    }
  }

  const byTextSource = await db.query<T>(
    `
      SELECT ${params.selectColumns}
      FROM pireps
      WHERE pilot_id = $1
        AND source_pirep_id::text = $2
      LIMIT 1
    `,
    [params.pilotId, trimmed],
  );

  return byTextSource.rows[0] ?? null;
}

export async function getPilotPirepSummaryByIdentifier(params: {
  pilotId: number;
  identifier: string;
}) {
  const summaryColumns = `
    id,
    source_pirep_id,
    pilot_id,
    source_pilot_id,
    username,
    callsign,
    flight_number,
    status,
    type,
    network,
    aircraft_registration,
    aircraft_type_code,
    departure_airport_code,
    arrival_airport_code,
    flight_distance,
    flight_length,
    block_length,
    landing_rate,
    landing_g,
    off_blocks_time,
    departure_time,
    landing_time,
    on_blocks_time,
    source_created_at,
    created_at,
    updated_at,
    COALESCE(
      NULLIF(BTRIM(raw_payload->>'route'), ''),
      NULLIF(BTRIM((raw_payload->'data')->>'route'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'route'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'flightplan'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'flight_plan'), ''),
      NULLIF(BTRIM(raw_payload->>'pilot_route'), ''),
      NULLIF(BTRIM((raw_payload->'data')->>'pilot_route'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'pilot_route'), '')
    ) AS route,
    COALESCE(
      NULLIF(BTRIM(raw_payload->>'pilot_route'), ''),
      NULLIF(BTRIM((raw_payload->'data')->>'pilot_route'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'pilot_route'), ''),
      NULLIF(BTRIM(raw_payload->>'route'), ''),
      NULLIF(BTRIM((raw_payload->'data')->>'route'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'route'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'flightplan'), ''),
      NULLIF(BTRIM(raw_pirep_data->>'flight_plan'), '')
    ) AS pilot_route
  `;

  return queryPilotPirepByIdentifier<PirepSummaryRecord>({
    pilotId: params.pilotId,
    identifier: params.identifier,
    selectColumns: summaryColumns,
  });
}

export async function getPilotPirepTrackSourceByIdentifier(params: {
  pilotId: number;
  identifier: string;
}) {
  return queryPilotPirepByIdentifier<Pick<PirepRecord, "id" | "source_pirep_id" | "raw_payload" | "raw_pirep_data">>({
    pilotId: params.pilotId,
    identifier: params.identifier,
    selectColumns: "id, source_pirep_id, raw_payload, raw_pirep_data",
  });
}

export async function getPilotPirepLogSourceByIdentifier(params: {
  pilotId: number;
  identifier: string;
}) {
  return queryPilotPirepByIdentifier<
    Pick<PirepRecord, "id" | "source_pirep_id" | "raw_log" | "raw_pirep_data" | "departure_time" | "landing_time" | "on_blocks_time">
  >({
    pilotId: params.pilotId,
    identifier: params.identifier,
    selectColumns: "id, source_pirep_id, raw_log, raw_pirep_data, departure_time, landing_time, on_blocks_time",
  });
}

export function extractTrackPointsFromPirepRecord(
  pirep: Pick<PirepRecord, "raw_payload" | "raw_pirep_data">,
): PirepTrackPoint[] {
  const rawPayload = asObject(parseUnknownJson(pirep.raw_payload));
  const payloadData = asObject(parseUnknownJson(rawPayload?.data));
  const rawPirepData = asObject(parseUnknownJson(pirep.raw_pirep_data));

  const primaryTrack = asArray(payloadData?.position_reports ?? rawPayload?.position_reports);
  const fallbackTrack = asArray(rawPirepData?.position_reports);
  const source = primaryTrack.length > 0 ? primaryTrack : fallbackTrack;

  return source
    .map((row) => asObject(parseUnknownJson(row)))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const latitude = toFiniteNumber(row.latitude ?? row.lat);
      const longitude = toFiniteNumber(row.longitude ?? row.lon ?? row.lng ?? row.long);
      if (latitude == null || longitude == null) return null;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

      return {
        timestamp:
          toIsoLikeTimestamp(row.timestamp ?? row.created_at ?? row.reported_at ?? row.time) ??
          new Date().toISOString(),
        phase: String(row.phase ?? row.flight_phase ?? "CRUISE"),
        latitude,
        longitude,
        altitude: toFiniteNumber(row.altitude ?? row.alt ?? row.altitude_ft) ?? 0,
        indicated_airspeed: toFiniteNumber(row.indicated_airspeed ?? row.ias) ?? 0,
        ground_speed:
          toFiniteNumber(
            row.ground_speed ??
              row.groundSpeed ??
              row.groundspeed ??
              row.gs ??
              row.speed ??
              row.speed_kts ??
              row.ground_speed_kts,
          ) ?? 0,
        vertical_speed: toFiniteNumber(row.vertical_speed ?? row.vs) ?? 0,
        heading: toFiniteNumber(row.heading ?? row.hdg ?? row.track) ?? 0,
        fuel_on_board: toFiniteNumber(row.fuel_on_board ?? row.fob) ?? 0,
        on_ground: Boolean(row.on_ground ?? false),
      } satisfies PirepTrackPoint;
    })
    .filter((row): row is PirepTrackPoint => Boolean(row));
}

export function extractLogEventsFromPirepRecord(
  pirep: Pick<
    PirepRecord,
    "raw_log" | "raw_pirep_data" | "departure_time" | "landing_time" | "on_blocks_time"
  >,
): PirepLogEvent[] {
  const rootEvents = asArray(pirep.raw_log)
    .map((event) => asObject(parseUnknownJson(event)))
    .filter((event): event is Record<string, unknown> => Boolean(event))
    .map((event) => {
      const timestamp = toIsoLikeTimestamp(event.timestamp ?? event.time ?? event.created_at);
      if (!timestamp) return null;
      const kind = String(event.kind ?? event.type ?? "EVENT");
      return {
        kind,
        description: String(event.description ?? event.message ?? kind),
        timestamp,
        payload: asObject(event.payload) ?? {},
      } satisfies PirepLogEvent;
    })
    .filter((event): event is PirepLogEvent => Boolean(event));

  if (rootEvents.length > 0) {
    return rootEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  const rawPirepData = asObject(parseUnknownJson(pirep.raw_pirep_data));
  const generated: PirepLogEvent[] = [];
  const addEvent = (kind: string, timeValue: unknown, description: string) => {
    const timestamp = toIsoLikeTimestamp(timeValue);
    if (!timestamp) return;
    generated.push({ kind, description, timestamp, payload: {} });
  };

  for (const row of asArray(rawPirepData?.takeoffs)) {
    addEvent("LIFTOFF", asObject(row)?.time, "Takeoff");
  }
  for (const row of asArray(rawPirepData?.landings)) {
    addEvent("TOUCHDOWN", asObject(row)?.time, "Landing");
  }
  for (const row of asArray(rawPirepData?.touchdowns)) {
    addEvent("TOUCHDOWN", asObject(row)?.time, "Touchdown");
  }
  for (const row of asArray(rawPirepData?.engines)) {
    const rec = asObject(row);
    const status = String(rec?.status ?? "").toLowerCase();
    addEvent(status === "off" ? "ENGINE_SHUTDOWN" : "ENGINE_START", rec?.time, `Engine ${status || "state"}`);
  }
  for (const row of asArray(rawPirepData?.pauses)) {
    const rec = asObject(row);
    const action = String(rec?.action ?? "").toLowerCase();
    addEvent(action === "unpaused" ? "RESUME" : "PAUSE", rec?.time, `Flight ${action || "pause"}`);
  }

  if (generated.length === 0) {
    addEvent("LIFTOFF", pirep.departure_time, "Departure");
    addEvent("TOUCHDOWN", pirep.landing_time, "Landing");
    addEvent("ENGINE_SHUTDOWN", pirep.on_blocks_time, "On blocks");
  }

  return generated.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getPilotPirepStats(params: {
  pilotId: number;
  days?: number;
}) {
  const db = getDb();
  const values: unknown[] = [params.pilotId];
  let rangeClause = "";

  if (typeof params.days === "number" && Number.isFinite(params.days) && params.days > 0) {
    const index = values.push(Math.min(Math.floor(params.days), 3650));
    rangeClause = `AND COALESCE(on_blocks_time, source_created_at, created_at) >= NOW() - ($${index} * INTERVAL '1 day')`;
  }

  const result = await db.query<PilotPirepStats>(
    `
      SELECT
        COUNT(*)::INT AS total_flights,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'accepted')::INT AS accepted_flights,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'rejected')::INT AS rejected_flights,
        COALESCE(SUM(flight_length), 0)::INT AS total_flight_seconds,
        COALESCE(SUM(block_length), 0)::INT AS total_block_seconds,
        COALESCE(SUM(credited_time), 0)::INT AS total_credited_seconds,
        COALESCE(SUM(flight_distance), 0)::FLOAT8 AS total_distance_nm,
        COALESCE(SUM(fuel_used), 0)::FLOAT8 AS total_fuel_used,
        AVG(landing_rate)::FLOAT8 AS average_landing_rate,
        AVG(landing_g)::FLOAT8 AS average_landing_g,
        AVG(flight_distance)::FLOAT8 AS average_distance_nm,
        AVG(flight_length)::FLOAT8 AS average_flight_seconds,
        COALESCE(SUM(points), 0)::INT AS total_points,
        COALESCE(SUM(bonus_sum), 0)::INT AS total_bonus_points,
        MAX(COALESCE(on_blocks_time, source_created_at, created_at))::TEXT AS last_flight_time
      FROM pireps
      WHERE pilot_id = $1
      ${rangeClause}
    `,
    values,
  );

  return (
    result.rows[0] ?? {
      total_flights: 0,
      accepted_flights: 0,
      rejected_flights: 0,
      total_flight_seconds: 0,
      total_block_seconds: 0,
      total_credited_seconds: 0,
      total_distance_nm: 0,
      total_fuel_used: 0,
      average_landing_rate: null,
      average_landing_g: null,
      average_distance_nm: null,
      average_flight_seconds: null,
      total_points: 0,
      total_bonus_points: 0,
      last_flight_time: null,
    }
  );
}
