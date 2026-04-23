import { fetchExternalPilotByUsername } from "@/lib/external-platform";
import { findPilotByUsername, toPublicPilot, upsertPilotFromExternal } from "@/lib/pilots";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const username = body?.username?.trim();

  if (!username) {
    return Response.json(
      {
        error: "username is required",
      },
      { status: 400 },
    );
  }

  const pilot = await findPilotByUsername(username);
  if (pilot) {
    return Response.json({
      exists: true,
      hasPassword: Boolean(pilot.password_hash),
      hasVerifiedEmail: Boolean(pilot.email && pilot.email_verified_at),
      source: "local",
      pilot: toPublicPilot(pilot),
    });
  }

  let externalPilot;
  try {
    externalPilot = await fetchExternalPilotByUsername(username);
  } catch {
    return Response.json(
      {
        error: "external lookup unavailable",
      },
      { status: 503 },
    );
  }

  if (!externalPilot) {
    return Response.json(
      {
        exists: false,
        hasPassword: false,
      },
      { status: 404 },
    );
  }

  const upserted = await upsertPilotFromExternal({
    profile: externalPilot,
    sourceName: "external-platform",
  });

  if (!upserted) {
    return Response.json({ error: "failed to sync pilot" }, { status: 500 });
  }

  return Response.json({
    exists: true,
    hasPassword: Boolean(upserted.password_hash),
    hasVerifiedEmail: Boolean(upserted.email && upserted.email_verified_at),
    source: "external_synced",
    pilot: toPublicPilot(upserted),
  });
}
