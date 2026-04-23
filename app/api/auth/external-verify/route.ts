import { resolvePilotAndIssueBootstrap } from "@/lib/external-auth";
import { issueBootstrapToken } from "@/lib/auth";
import {
  fetchExternalPilotByUsername,
  verifyExternalIdentity,
} from "@/lib/external-platform";
import { findPilotByUsername, upsertPilotFromExternal } from "@/lib/pilots";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        username?: string;
        externalAccessToken?: string;
        externalToken?: string;
      }
    | null;
  const username = body?.username?.trim();
  const externalAccessToken = body?.externalAccessToken?.trim();
  const externalToken = body?.externalToken?.trim();

  if (!username || (!externalAccessToken && !externalToken)) {
    return Response.json(
      {
        error: "username and (externalAccessToken or externalToken) are required",
      },
      { status: 400 },
    );
  }

  let verifiedExternalProfile = null;

  if (externalAccessToken) {
    const bootstrap = await resolvePilotAndIssueBootstrap({
      username,
      externalAccessToken,
    }).catch(() => null);

    if (!bootstrap) {
      return Response.json({ error: "external verification failed" }, { status: 401 });
    }

    return Response.json({
      bootstrapToken: bootstrap.bootstrapToken,
      expiresInSeconds: bootstrap.expiresInSeconds,
    });
  } else if (externalToken) {
    const verification = await verifyExternalIdentity({
      username,
      externalToken,
    }).catch(() => null);

    if (!verification?.success) {
      return Response.json({ error: "external verification failed" }, { status: 401 });
    }
  }

  let pilot = await findPilotByUsername(username);
  if (!pilot && verifiedExternalProfile) {
    pilot = await upsertPilotFromExternal({
      profile: verifiedExternalProfile,
      sourceName: "external-platform",
    });
  }

  if (!pilot) {
    const externalPilot = verifiedExternalProfile ?? (await fetchExternalPilotByUsername(username).catch(() => null));
    if (!externalPilot) {
      return Response.json({ error: "pilot not found after external verification" }, { status: 404 });
    }

    pilot = await upsertPilotFromExternal({
      profile: externalPilot,
      sourceName: "external-platform",
    });
  }

  if (!pilot) {
    return Response.json({ error: "failed to resolve pilot" }, { status: 500 });
  }

  const bootstrap = issueBootstrapToken({
    pilotId: pilot.id,
    username: pilot.username,
  });

  return Response.json({
    bootstrapToken: bootstrap.token,
    expiresInSeconds: bootstrap.expiresInSeconds,
  });
}
