import { hashPassword, issueAuthToken, verifyBootstrapToken } from "@/lib/auth";
import { enqueueAndKickPilotPirepBackfill } from "@/lib/pirep-sync";
import { findPilotByUsername, setPilotPasswordFirstTime, toPublicPilot } from "@/lib/pilots";

export const dynamic = "force-dynamic";

function validatePassword(password: string) {
  if (password.length < 8) return "password length must be at least 8";
  if (password.length > 128) return "password length must be <= 128";
  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; password?: string; bootstrapToken?: string }
    | null;
  const username = body?.username?.trim();
  const password = body?.password ?? "";
  const bootstrapToken = body?.bootstrapToken?.trim();

  if (!username) {
    return Response.json({ error: "username is required" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }

  const pilot = await findPilotByUsername(username);
  if (!pilot) {
    return Response.json({ error: "pilot not found" }, { status: 404 });
  }

  if (pilot.password_hash) {
    return Response.json({ error: "password already set" }, { status: 409 });
  }

  if (!pilot.email || !pilot.email_verified_at) {
    return Response.json({ error: "email not verified yet" }, { status: 409 });
  }

  if (!bootstrapToken) {
    return Response.json({ error: "bootstrapToken is required" }, { status: 401 });
  }

  let bootstrapPayload: { pilot_id: number; username: string };
  try {
    bootstrapPayload = verifyBootstrapToken(bootstrapToken);
  } catch {
    return Response.json({ error: "invalid bootstrapToken" }, { status: 401 });
  }

  if (
    bootstrapPayload.pilot_id !== pilot.id ||
    bootstrapPayload.username.toLowerCase() !== pilot.username.toLowerCase()
  ) {
    return Response.json({ error: "bootstrapToken does not match pilot" }, { status: 401 });
  }

  const hashed = await hashPassword(password);
  const updated = await setPilotPasswordFirstTime({
    pilotId: pilot.id,
    passwordHash: hashed.passwordHash,
    passwordSalt: hashed.passwordSalt,
    passwordAlgo: hashed.passwordAlgo,
  });

  if (!updated) {
    return Response.json({ error: "password already set" }, { status: 409 });
  }

  const token = issueAuthToken({
    pilotId: updated.id,
    username: updated.username,
  });

  void enqueueAndKickPilotPirepBackfill({
    pilotId: updated.id,
    sourcePilotId: updated.source_pilot_id,
  });

  return Response.json({
    token: token.token,
    expiresInSeconds: token.expiresInSeconds,
    pilot: toPublicPilot(updated),
  });
}
