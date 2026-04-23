import { readBearerToken, verifyAuthToken } from "@/lib/auth";
import {
  cancelCurrentDispatchForPilot,
  getCurrentDispatchForPilot,
  upsertCurrentDispatchForPilot,
} from "@/lib/dispatch";
import { getDb } from "@/lib/db";
import { findPilotById, updatePilotCurrentAirport } from "@/lib/pilots";

export const dynamic = "force-dynamic";

function readAuthPayload(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const auth = readAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const [pilot, dispatch] = await Promise.all([
    findPilotById(auth.sub),
    getCurrentDispatchForPilot(auth.sub),
  ]);

  if (!pilot) {
    return Response.json({ error: "pilot not found" }, { status: 404 });
  }

  return Response.json({
    current_airport_icao: pilot.current_airport_icao,
    dispatch,
  });
}

export async function POST(request: Request) {
  const auth = readAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const departureIcao = pickString(body, ["departure_icao", "departureIcao"]);
  const arrivalIcao = pickString(body, ["arrival_icao", "arrivalIcao"]);

  if (!departureIcao || !arrivalIcao) {
    return Response.json({ error: "departure_icao and arrival_icao are required" }, { status: 400 });
  }

  const db = getDb();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const dispatch = await upsertCurrentDispatchForPilot(
      {
        pilotId: auth.sub,
        departureIcao,
        arrivalIcao,
        flightNumber: pickString(body, ["flight_number", "flightNumber"]),
        callsign: pickString(body, ["callsign"]),
        operatorCode: pickString(body, ["operator_code", "operatorCode"]),
        routeId: pickNumber(body, ["route_id", "routeId"]),
        fleetId: pickNumber(body, ["fleet_id", "fleetId"]),
        aircraftId: pickNumber(body, ["aircraft_id", "aircraftId"]),
        aircraftType: pickString(body, ["aircraft_type", "aircraftType"]),
        registration: pickString(body, ["registration"]),
        dispatchPayload: body,
      },
      client,
    );

    await updatePilotCurrentAirport({
      pilotId: auth.sub,
      airportIcao: departureIcao,
      db: client,
    });

    await client.query("COMMIT");

    return Response.json({
      ok: true,
      current_airport_icao: departureIcao.trim().toUpperCase(),
      dispatch,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "failed to save dispatch";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const auth = readAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const dispatch = await cancelCurrentDispatchForPilot(auth.sub);

  return Response.json({
    ok: true,
    dispatch: dispatch ?? null,
  });
}
