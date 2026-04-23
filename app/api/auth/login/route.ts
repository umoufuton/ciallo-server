import { issueAuthToken, verifyPassword } from "@/lib/auth";
import { enqueueAndKickPilotPirepBackfill } from "@/lib/pirep-sync";
import { findPilotByEmail, findPilotByUsername, toPublicPilot, updatePilotLastLogin } from "@/lib/pilots";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; email?: string; password?: string }
    | null;
  const username = body?.username?.trim();
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";

  if ((!username && !email) || !password) {
    return Response.json({ error: "email(or username) and password are required" }, { status: 400 });
  }

  const pilot = email ? await findPilotByEmail(email) : await findPilotByUsername(username ?? "");
  if (!pilot) {
    return Response.json({ error: "invalid email(username) or password" }, { status: 401 });
  }

  if (!pilot.password_hash || !pilot.password_salt) {
    return Response.json({ error: "password not set yet" }, { status: 409 });
  }

  const isValid = await verifyPassword(password, pilot.password_hash, pilot.password_salt);
  if (!isValid) {
    return Response.json({ error: "invalid email(username) or password" }, { status: 401 });
  }

  await updatePilotLastLogin(pilot.id);
  void enqueueAndKickPilotPirepBackfill({
    pilotId: pilot.id,
    sourcePilotId: pilot.source_pilot_id,
  });

  const token = issueAuthToken({
    pilotId: pilot.id,
    username: pilot.username,
  });

  return Response.json({
    token: token.token,
    expiresInSeconds: token.expiresInSeconds,
    pilot: toPublicPilot(pilot),
  });
}
