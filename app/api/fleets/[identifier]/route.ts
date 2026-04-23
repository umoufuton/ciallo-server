import { getFleetByIdentifier } from "@/lib/fleet";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext<"/api/fleets/[identifier]">) {
  const { identifier } = await context.params;
  const fleet = await getFleetByIdentifier(identifier);

  if (!fleet) {
    return Response.json(
      {
        error: "Fleet not found",
      },
      { status: 404 },
    );
  }

  return Response.json({
    data: fleet,
  });
}
