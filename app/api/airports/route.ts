import { listAirports } from "@/lib/airports";

export const dynamic = "force-dynamic";

function parseBoolean(value: string | null) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const airports = await listAirports({
    q: searchParams.get("q") ?? undefined,
    base: parseBoolean(searchParams.get("base")),
    alternate: parseBoolean(searchParams.get("alternate")),
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return Response.json({
    data: airports,
    count: airports.length,
  });
}
