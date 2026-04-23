import {
  extractLogEventsFromPirepRecord,
  extractTrackPointsFromPirepRecord,
  getPilotPirepByIdentifier,
  getPilotPirepLogSourceByIdentifier,
  getPilotPirepSummaryByIdentifier,
  getPilotPirepTrackSourceByIdentifier,
} from "@/lib/pireps";
import { readPirepAuthPayload } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/pireps/[identifier]">) {
  const { identifier } = await context.params;
  const { searchParams } = new URL(request.url);
  const part = searchParams.get("part")?.trim().toLowerCase() ?? "summary";
  const auth = readPirepAuthPayload(request);

  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  if (part === "summary") {
    const summary = await getPilotPirepSummaryByIdentifier({
      pilotId: auth.sub,
      identifier,
    });
    if (!summary) {
      return Response.json({ error: "PIREP not found" }, { status: 404 });
    }
    return Response.json({ data: summary });
  }

  if (part === "track") {
    const pirep = await getPilotPirepTrackSourceByIdentifier({
      pilotId: auth.sub,
      identifier,
    });
    if (!pirep) {
      return Response.json({ error: "PIREP not found" }, { status: 404 });
    }
    return Response.json({
      data: {
        id: pirep.id,
        source_pirep_id: pirep.source_pirep_id,
        position_reports: extractTrackPointsFromPirepRecord(pirep),
      },
    });
  }

  if (part === "log") {
    const pirep = await getPilotPirepLogSourceByIdentifier({
      pilotId: auth.sub,
      identifier,
    });
    if (!pirep) {
      return Response.json({ error: "PIREP not found" }, { status: 404 });
    }
    return Response.json({
      data: {
        id: pirep.id,
        source_pirep_id: pirep.source_pirep_id,
        events: extractLogEventsFromPirepRecord(pirep),
      },
    });
  }

  const pirep = await getPilotPirepByIdentifier({
    pilotId: auth.sub,
    identifier,
  });

  if (!pirep) {
    return Response.json({ error: "PIREP not found" }, { status: 404 });
  }

  return Response.json({
    data: pirep,
  });
}
