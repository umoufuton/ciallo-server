import { checkClientUpdate } from "@/lib/client-updates";

export const dynamic = "force-dynamic";

function pickQuery(searchParams: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value && value.trim().length > 0) return value.trim();
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentVersion = pickQuery(searchParams, ["currentVersion", "version"]);
  const platform = pickQuery(searchParams, ["platform", "os"]);
  const arch = pickQuery(searchParams, ["arch"]);
  const channel = pickQuery(searchParams, ["channel"]);
  const rolloutSeed = pickQuery(searchParams, ["clientId", "deviceId", "seed"]);

  if (!currentVersion) {
    return Response.json({ error: "currentVersion is required" }, { status: 400 });
  }

  if (!platform) {
    return Response.json({ error: "platform is required" }, { status: 400 });
  }

  try {
    const result = await checkClientUpdate({
      currentVersion,
      platform,
      arch,
      channel,
      rolloutSeed,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to check update";
    return Response.json({ error: message }, { status: 500 });
  }
}
