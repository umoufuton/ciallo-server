import { readBearerToken, verifyAuthToken } from "@/lib/auth";
import { getPilotPirepSyncState } from "@/lib/pirep-sync";

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

  const state = await getPilotPirepSyncState(payload.sub);
  return Response.json({
    state,
  });
}
