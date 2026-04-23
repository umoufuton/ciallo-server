import { extractTrackPointsFromPirepRecord, getPilotPirepTrackSourceByIdentifier } from "@/lib/pireps";
import { readPirepAuthPayload } from "../../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/pireps/[identifier]/track">) {
  const auth = readPirepAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const { identifier } = await context.params;
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
