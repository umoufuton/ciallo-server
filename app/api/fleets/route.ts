import { listFleets } from "@/lib/fleet";

export const dynamic = "force-dynamic";

function parseBoolean(value: string | null) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const fleets = await listFleets({
    q: searchParams.get("q") ?? undefined,
    typeCode: searchParams.get("typeCode") ?? undefined,
    hidden: parseBoolean(searchParams.get("hidden")),
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return Response.json({
    data: fleets,
    count: fleets.length,
  });
}
