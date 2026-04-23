import { getAircraftByIdentifier } from "@/lib/aircraft";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext<"/api/aircraft/[identifier]">) {
  const { identifier } = await context.params;
  const aircraft = await getAircraftByIdentifier(identifier);

  if (!aircraft) {
    return Response.json(
      {
        error: "Aircraft not found",
      },
      { status: 404 },
    );
  }

  return Response.json({
    data: aircraft,
  });
}
