import { resolvePilotAndIssueBootstrap } from "@/lib/external-auth";
import {
  getPilotOauthSession,
  setPilotOauthSessionBootstrap,
  setPilotOauthSessionFailed,
  setPilotOauthSessionProcessing,
} from "@/lib/pilot-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { state?: string; username?: string }
    | null;
  const state = body?.state?.trim();
  const username = body?.username?.trim().toUpperCase();

  if (!state || !username) {
    return Response.json({ error: "state and username are required" }, { status: 400 });
  }

  const session = getPilotOauthSession(state);
  if (!session) {
    return Response.json({ status: "expired", error: "oauth session expired" }, { status: 404 });
  }

  if (session.username.toUpperCase() !== username) {
    return Response.json({ error: "oauth session username mismatch" }, { status: 401 });
  }

  if (session.status === "failed") {
    return Response.json({ status: "failed", error: session.error ?? "oauth failed" });
  }

  if (session.status === "verified" && session.bootstrapToken) {
    return Response.json({
      status: "verified",
      bootstrapToken: session.bootstrapToken,
      expiresInSeconds: session.bootstrapExpiresInSeconds,
    });
  }

  if (session.status === "processing") {
    return Response.json({ status: "pending" });
  }

  if (session.status === "token_ready" && session.accessToken) {
    setPilotOauthSessionProcessing(state);
    try {
      const resolved = await resolvePilotAndIssueBootstrap({
        username,
        externalAccessToken: session.accessToken,
      });

      setPilotOauthSessionBootstrap(state, resolved.bootstrapToken, resolved.expiresInSeconds);
      return Response.json({
        status: "verified",
        bootstrapToken: resolved.bootstrapToken,
        expiresInSeconds: resolved.expiresInSeconds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "external verification failed";
      setPilotOauthSessionFailed(state, message);
      return Response.json({ status: "failed", error: message });
    }
  }

  return Response.json({ status: "pending" });
}
