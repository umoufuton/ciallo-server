import { getRankByIdentifier } from "@/lib/ranks";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext<"/api/ranks/[identifier]">) {
  const { identifier } = await context.params;
  const rank = await getRankByIdentifier(identifier);

  if (!rank) {
    return Response.json(
      {
        error: "Rank not found",
      },
      { status: 404 },
    );
  }

  return Response.json({
    data: rank,
  });
}
