import { listAirportMapBbox } from "@/lib/airports";

export const dynamic = "force-dynamic";

function parseNumber(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBbox(value: string | null) {
  if (!value) return null;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90 || minLat > maxLat) {
    return null;
  }
  if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
    return null;
  }

  return { minLon, minLat, maxLon, maxLat };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bbox = parseBbox(searchParams.get("bbox"));
  if (!bbox) {
    return Response.json(
      {
        error: "bbox must be minLon,minLat,maxLon,maxLat",
      },
      { status: 400 },
    );
  }

  const zoom = parseNumber(searchParams.get("zoom")) ?? undefined;
  const limit = parseNumber(searchParams.get("limit")) ?? undefined;
  const result = await listAirportMapBbox({
    ...bbox,
    zoom,
    limit,
  });

  return Response.json(
    {
      data: result.airports,
      count: result.airports.length,
      truncated: result.truncated,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    },
  );
}
