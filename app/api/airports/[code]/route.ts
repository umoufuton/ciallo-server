import { getAirportByCode } from "@/lib/airports";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext<"/api/airports/[code]">) {
  const { code } = await context.params;
  const airport = await getAirportByCode(code);

  if (!airport) {
    return Response.json(
      {
        error: "Airport not found",
      },
      { status: 404 },
    );
  }

  return Response.json({
    data: airport,
  });
}
