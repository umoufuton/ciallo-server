import { getScheduledRouteByIdentifier } from "@/lib/routes";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext<"/api/routes/[identifier]">) {
  const { identifier } = await context.params;
  const route = await getScheduledRouteByIdentifier(identifier);

  if (!route) {
    return Response.json(
      {
        error: "Route not found",
      },
      { status: 404 },
    );
  }

  return Response.json({
    data: route,
  });
}
