import { readBearerToken, verifyAuthToken } from "@/lib/auth";
import { findPilotById, toPublicPilot } from "@/lib/pilots";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = readBearerToken(request);
  if (!token) {
    return Response.json({ error: "missing bearer token" }, { status: 401 });
  }

  let payload: { sub: number };
  try {
    payload = verifyAuthToken(token);
  } catch {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const pilot = await findPilotById(payload.sub);
  if (!pilot) {
    return Response.json({ error: "pilot not found" }, { status: 404 });
  }

  return Response.json({
    pilot: toPublicPilot(pilot),
  });
}
