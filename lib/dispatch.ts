import { getDb } from "@/lib/db";

type Queryable = {
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DispatchStatus = "ACTIVE" | "IN_PROGRESS" | "CLEARED" | "CANCELLED";

export type PilotDispatchRecord = {
  id: number;
  pilot_id: number;
  status: DispatchStatus;
  departure_icao: string;
  arrival_icao: string;
  flight_number: string | null;
  callsign: string | null;
  operator_code: string | null;
  route_id: number | null;
  fleet_id: number | null;
  aircraft_id: number | null;
  aircraft_type: string | null;
  registration: string | null;
  dispatch_payload: unknown;
  created_at: string;
  updated_at: string;
  cleared_at: string | null;
};

export type UpsertCurrentDispatchInput = {
  pilotId: number;
  departureIcao: string;
  arrivalIcao: string;
  flightNumber?: string | null;
  callsign?: string | null;
  operatorCode?: string | null;
  routeId?: number | null;
  fleetId?: number | null;
  aircraftId?: number | null;
  aircraftType?: string | null;
  registration?: string | null;
  dispatchPayload?: Record<string, unknown>;
};

function normalizeIcao(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== 4) return null;
  return normalized;
}

function normalizeText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export async function getCurrentDispatchForPilot(pilotId: number, db?: Queryable) {
  const conn = db ?? getDb();
  const result = await conn.query<PilotDispatchRecord>(
    `
      SELECT *
      FROM pilot_dispatches
      WHERE pilot_id = $1
        AND status IN ('ACTIVE', 'IN_PROGRESS')
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [pilotId],
  );

  return result.rows[0] ?? null;
}

export async function upsertCurrentDispatchForPilot(input: UpsertCurrentDispatchInput, db?: Queryable) {
  const conn = db ?? getDb();
  const departureIcao = normalizeIcao(input.departureIcao);
  const arrivalIcao = normalizeIcao(input.arrivalIcao);

  if (!departureIcao || !arrivalIcao) {
    throw new Error("departure_icao and arrival_icao are required 4-letter ICAO codes");
  }

  await conn.query(
    `
      UPDATE pilot_dispatches
      SET status = 'CANCELLED', cleared_at = NOW()
      WHERE pilot_id = $1
        AND status IN ('ACTIVE', 'IN_PROGRESS')
    `,
    [input.pilotId],
  );

  const inserted = await conn.query<PilotDispatchRecord>(
    `
      INSERT INTO pilot_dispatches (
        pilot_id,
        status,
        departure_icao,
        arrival_icao,
        flight_number,
        callsign,
        operator_code,
        route_id,
        fleet_id,
        aircraft_id,
        aircraft_type,
        registration,
        dispatch_payload
      ) VALUES (
        $1, 'ACTIVE', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
      )
      RETURNING *
    `,
    [
      input.pilotId,
      departureIcao,
      arrivalIcao,
      normalizeText(input.flightNumber ?? null, 32),
      normalizeText(input.callsign ?? null, 32),
      normalizeText(input.operatorCode ?? null, 16),
      input.routeId ?? null,
      input.fleetId ?? null,
      input.aircraftId ?? null,
      normalizeText(input.aircraftType ?? null, 32),
      normalizeText(input.registration ?? null, 32),
      JSON.stringify(input.dispatchPayload ?? {}),
    ],
  );

  return inserted.rows[0] ?? null;
}

export async function cancelCurrentDispatchForPilot(pilotId: number, db?: Queryable) {
  const conn = db ?? getDb();
  const result = await conn.query<PilotDispatchRecord>(
    `
      UPDATE pilot_dispatches
      SET status = 'CANCELLED', cleared_at = NOW()
      WHERE pilot_id = $1
        AND status IN ('ACTIVE', 'IN_PROGRESS')
      RETURNING *
    `,
    [pilotId],
  );

  return result.rows[0] ?? null;
}

export async function clearDispatchAfterPirep(
  params: {
    pilotId: number;
    dispatchId?: number | null;
    flightNumber?: string | null;
    departureIcao?: string | null;
    arrivalIcao?: string | null;
  },
  db?: Queryable,
) {
  const conn = db ?? getDb();

  if (params.dispatchId) {
    const byId = await conn.query<PilotDispatchRecord>(
      `
        UPDATE pilot_dispatches
        SET status = 'CLEARED', cleared_at = NOW()
        WHERE id = $1
          AND pilot_id = $2
          AND status IN ('ACTIVE', 'IN_PROGRESS')
        RETURNING *
      `,
      [params.dispatchId, params.pilotId],
    );

    if (byId.rows[0]) return byId.rows[0];
  }

  const normalizedFlight = normalizeText(params.flightNumber ?? null, 32)?.toUpperCase() ?? null;
  const departureIcao = normalizeIcao(params.departureIcao);
  const arrivalIcao = normalizeIcao(params.arrivalIcao);

  const fallback = await conn.query<PilotDispatchRecord>(
    `
      UPDATE pilot_dispatches
      SET status = 'CLEARED', cleared_at = NOW()
      WHERE id = (
        SELECT id
        FROM pilot_dispatches
        WHERE pilot_id = $1
          AND status IN ('ACTIVE', 'IN_PROGRESS')
          AND ($2::text IS NULL OR UPPER(COALESCE(flight_number, '')) = $2::text)
          AND ($3::text IS NULL OR UPPER(departure_icao) = $3::text)
          AND ($4::text IS NULL OR UPPER(arrival_icao) = $4::text)
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      )
      RETURNING *
    `,
    [params.pilotId, normalizedFlight, departureIcao, arrivalIcao],
  );

  return fallback.rows[0] ?? null;
}
