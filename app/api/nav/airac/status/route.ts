import { getActiveAiracStatus, listAiracStatuses } from "@/lib/navdata";

export const dynamic = "force-dynamic";

export async function GET() {
  const active = await getActiveAiracStatus();
  const cycles = await listAiracStatuses();

  return Response.json({
    ok: Boolean(active),
    active,
    cycles,
  });
}
