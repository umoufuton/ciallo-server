import { getAirportMapIndexVersion, listAirportMapIndex } from "@/lib/airports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const version = await getAirportMapIndexVersion();
  const ifNoneMatch = request.headers.get("if-none-match");

  if (ifNoneMatch === version.etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: version.etag,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  }

  const airports = await listAirportMapIndex();

  return Response.json(
    {
      data: airports,
      count: airports.length,
      version: version.version,
      updatedAt: version.maxUpdatedAt,
    },
    {
      headers: {
        ETag: version.etag,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
