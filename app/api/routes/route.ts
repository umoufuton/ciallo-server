import { listScheduledRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

function parseBoolean(value: string | null) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const routes = await listScheduledRoutes({
    q: searchParams.get("q") ?? undefined,
    departure: searchParams.get("departure") ?? undefined,
    arrival: searchParams.get("arrival") ?? undefined,
    flightNumber: searchParams.get("flightNumber") ?? undefined,
    callsign: searchParams.get("callsign") ?? undefined,
    hidden: parseBoolean(searchParams.get("hidden")),
    sourceFleetId: searchParams.get("sourceFleetId") ? Number(searchParams.get("sourceFleetId")) : undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return Response.json({
    data: routes,
    count: routes.length,
  });
}
