import { readBearerToken, verifyAuthToken } from "@/lib/auth";
import { getPilotPirepStats } from "@/lib/pireps";

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

export async function GET(request: Request) {
  const auth = readAuthPayload(request);
  if (!auth) {
    return Response.json({ error: "invalid or missing bearer token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = searchParams.get("days") ? Number(searchParams.get("days")) : undefined;

  const stats = await getPilotPirepStats({
    pilotId: auth.sub,
    days,
  });

  return Response.json({
    pilotId: auth.sub,
    days: typeof days === "number" && Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    stats,
  });
}
