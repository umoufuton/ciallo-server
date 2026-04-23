import { issueBootstrapToken } from "@/lib/auth";
import { fetchExternalPilotByUsername, verifyExternalIdentityByAccessToken } from "@/lib/external-platform";
import { findPilotByUsername, upsertPilotFromExternal } from "@/lib/pilots";

export async function resolvePilotAndIssueBootstrap(params: {
  username: string;
  externalAccessToken: string;
}) {
  const username = params.username.trim();
  const verification = await verifyExternalIdentityByAccessToken({
    username,
    accessToken: params.externalAccessToken,
  });

  if (!verification.success) {
    throw new Error(`external verification failed: ${verification.reason ?? "unknown_reason"}`);
  }

  let pilot = await findPilotByUsername(username);
  if (!pilot && verification.profile) {
    pilot = await upsertPilotFromExternal({
      profile: verification.profile,
      sourceName: "external-platform",
    });
  }

  if (!pilot) {
    const externalPilot = verification.profile ?? (await fetchExternalPilotByUsername(username).catch(() => null));
    if (!externalPilot) {
      throw new Error("pilot not found after external verification");
    }

    pilot = await upsertPilotFromExternal({
      profile: externalPilot,
      sourceName: "external-platform",
    });
  }

  if (!pilot) {
    throw new Error("failed to resolve pilot");
  }

  const bootstrap = issueBootstrapToken({
    pilotId: pilot.id,
    username: pilot.username,
  });

  return {
    bootstrapToken: bootstrap.token,
    expiresInSeconds: bootstrap.expiresInSeconds,
  };
}
