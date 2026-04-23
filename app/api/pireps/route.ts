import { readPirepAuthPayload } from "./_auth";
import { clearDispatchAfterPirep } from "@/lib/dispatch";
import { getDb } from "@/lib/db";
import { updatePilotCurrentAirport } from "@/lib/pilots";
import { countPilotPireps, listPilotPireps, upsertPilotPirep } from "@/lib/pireps";

export const dynamic = "force-dynamic";

function unwrapPayload(body: Record<string, unknown>) {
  const data = body.data;
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return body;
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

function pickAirportCodeFromNode(node: unknown) {
  if (!node || typeof node !== "object") return null;
  const source = node as Record<string, unknown>;
  const icao = pickString(source, ["icao", "ICAO"]);
  const iata = pickString(source, ["iata", "IATA"]);
  const code = icao ?? iata;
  return code ? code.toUpperCase() : null;
}

export async function GET(request: Request) {
  const auth = readPirepAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;
  const status = searchParams.get("status") ?? undefined;
  const pireps = await listPilotPireps({
    pilotId: auth.sub,
    status,
    limit,
    offset,
  });
  const total = await countPilotPireps({
    pilotId: auth.sub,
    status,
  });

  return Response.json({
    data: pireps,
    count: pireps.length,
    total,
    limit: typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : null,
    offset: typeof offset === "number" && Number.isFinite(offset) ? Math.floor(offset) : null,
  });
}

export async function POST(request: Request) {
  const auth = readPirepAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const payloadRoot = unwrapPayload(body);
  const dispatchId = pickNumber(payloadRoot, ["dispatch_id", "dispatchId"]);
  const flightNumber = pickString(payloadRoot, ["flight_number", "flightNumber"]);
  const departureIcao =
    pickString(payloadRoot, ["departure_icao", "departureIcao"]) ??
    pickAirportCodeFromNode(payloadRoot.departure_airport);
  const arrivalIcao =
    pickString(payloadRoot, ["arrival_icao", "arrivalIcao"]) ??
    pickAirportCodeFromNode(payloadRoot.arrival_airport);

  const db = getDb();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const record = await upsertPilotPirep({
      pilotId: auth.sub,
      fallbackUsername: auth.username,
      payload: body,
      db: client,
    });

    if (!record) {
      await client.query("ROLLBACK");
      return Response.json({ error: "failed to save pirep" }, { status: 500 });
    }

    const resolvedArrival = (arrivalIcao ?? record.arrival_airport_code)?.toUpperCase() ?? null;
    let linkageWarning: string | null = null;
    try {
      await clearDispatchAfterPirep(
        {
          pilotId: auth.sub,
          dispatchId,
          flightNumber: flightNumber ?? record.flight_number,
          departureIcao: departureIcao ?? record.departure_airport_code,
          arrivalIcao: arrivalIcao ?? record.arrival_airport_code,
        },
        client,
      );

      if (resolvedArrival) {
        await updatePilotCurrentAirport({
          pilotId: auth.sub,
          airportIcao: resolvedArrival,
          db: client,
        });
      }
    } catch (linkageError) {
      const linkageMessage =
        linkageError instanceof Error ? linkageError.message : String(linkageError);
      linkageWarning = `dispatch_linkage_failed: ${linkageMessage}`;
      console.error("[pireps.post] dispatch linkage failed", {
        pilotId: auth.sub,
        dispatchId,
        flightNumber,
        departureIcao,
        arrivalIcao: resolvedArrival,
        error: linkageError,
      });
    }

    await client.query("COMMIT");

    return Response.json({
      ok: true,
      pirep: record,
      current_airport_icao: resolvedArrival,
      warning: linkageWarning,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof Error && error.message === "pirep_source_id_conflict") {
      return Response.json({ error: "pirep source id belongs to another pilot" }, { status: 409 });
    }

    const detail = error instanceof Error ? error.message : String(error);
    console.error("[pireps.post] failed to save pirep", {
      pilotId: auth.sub,
      dispatchId,
      flightNumber,
      departureIcao,
      arrivalIcao,
      error,
    });
    return Response.json({ error: "failed to save pirep", detail }, { status: 500 });
  } finally {
    client.release();
  }
}
