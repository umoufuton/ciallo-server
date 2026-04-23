import { getPilotPirepSummaryByIdentifier } from "@/lib/pireps";
import { readPirepAuthPayload } from "../../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/pireps/[identifier]/summary">) {
  const auth = readPirepAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const { identifier } = await context.params;
  const summary = await getPilotPirepSummaryByIdentifier({
    pilotId: auth.sub,
    identifier,
  });

  if (!summary) {
    return Response.json({ error: "PIREP not found" }, { status: 404 });
  }

  return Response.json({ data: summary });
}
