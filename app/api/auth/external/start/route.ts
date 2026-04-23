import { createPilotOauthSession } from "@/lib/pilot-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const username = body?.username?.trim();

  if (!username) {
    return Response.json({ error: "username is required" }, { status: 400 });
  }

  try {
    const session = createPilotOauthSession(username);
    return Response.json({
      state: session.state,
      authorizeUrl: session.authorizeUrl,
      expiresInSeconds: session.expiresInSeconds,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "failed to start oauth flow" },
      { status: 500 },
    );
  }
}
