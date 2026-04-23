import { buildLatestTauriManifest } from "@/lib/client-updates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel")?.trim().toLowerCase() || "stable";

  try {
    const manifest = await buildLatestTauriManifest({ channel });
    if (!manifest) {
      return Response.json({ error: "no published release found" }, { status: 404 });
    }
    return Response.json(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to build tauri manifest";
    return Response.json({ error: message }, { status: 500 });
  }
}

