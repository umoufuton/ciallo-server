import { listAircraft } from "@/lib/aircraft";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const aircraft = await listAircraft({
    q: searchParams.get("q") ?? undefined,
    fleetId: searchParams.get("fleetId") ? Number(searchParams.get("fleetId")) : undefined,
    sourceFleetId: searchParams.get("sourceFleetId") ? Number(searchParams.get("sourceFleetId")) : undefined,
    typeCode: searchParams.get("typeCode") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return Response.json({
    data: aircraft,
    count: aircraft.length,
  });
}
