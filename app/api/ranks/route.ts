import { listRanks } from "@/lib/ranks";

export const dynamic = "force-dynamic";

function parseBoolean(value: string | null) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const ranks = await listRanks({
    q: searchParams.get("q") ?? undefined,
    airlineId: searchParams.get("airlineId") ? Number(searchParams.get("airlineId")) : undefined,
    honoraryRank: parseBoolean(searchParams.get("honoraryRank")),
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return Response.json({
    data: ranks,
    count: ranks.length,
  });
}
