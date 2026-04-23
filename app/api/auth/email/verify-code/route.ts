import { verifyBootstrapToken, verifyPassword } from "@/lib/auth";
import { validateEmailAddress } from "@/lib/email-verification";
import {
  bumpPilotEmailVerifyAttempts,
  findPilotByUsername,
  markPilotEmailVerified,
  toPublicPilot,
} from "@/lib/pilots";

export const dynamic = "force-dynamic";

const MAX_VERIFY_ATTEMPTS = 8;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; bootstrapToken?: string; email?: string; code?: string }
    | null;
  const username = body?.username?.trim();
  const bootstrapToken = body?.bootstrapToken?.trim();
  const code = body?.code?.trim() ?? "";
  const emailRaw = body?.email ?? "";
  const emailCheck = validateEmailAddress(emailRaw);

  if (!username) {
    return Response.json({ error: "username is required" }, { status: 400 });
  }

  if (!bootstrapToken) {
    return Response.json({ error: "bootstrapToken is required" }, { status: 401 });
  }

  if (!emailCheck.ok) {
    return Response.json({ error: emailCheck.reason }, { status: 400 });
  }

  if (!/^\d{6}$/.test(code)) {
    return Response.json({ error: "verification code must be 6 digits" }, { status: 400 });
  }

  const pilot = await findPilotByUsername(username);
  if (!pilot) {
    return Response.json({ error: "pilot not found" }, { status: 404 });
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

  if ((pilot.email_verify_attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    return Response.json({ error: "too many verification attempts, resend code" }, { status: 429 });
  }

  if (
    !pilot.email_verify_target ||
    pilot.email_verify_target.toLowerCase() !== emailCheck.normalized.toLowerCase()
  ) {
    return Response.json({ error: "email does not match pending verification target" }, { status: 409 });
  }

  if (!pilot.email_verify_code_hash || !pilot.email_verify_code_salt || !pilot.email_verify_expires_at) {
    return Response.json({ error: "verification code not requested" }, { status: 409 });
  }

  if (new Date(pilot.email_verify_expires_at).getTime() < Date.now()) {
    return Response.json({ error: "verification code expired" }, { status: 410 });
  }

  const ok = await verifyPassword(code, pilot.email_verify_code_hash, pilot.email_verify_code_salt);
  if (!ok) {
    await bumpPilotEmailVerifyAttempts(pilot.id);
    return Response.json({ error: "invalid verification code" }, { status: 401 });
  }

  let updated;
  try {
    updated = await markPilotEmailVerified({
      pilotId: pilot.id,
      email: emailCheck.normalized,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (code === "23505") {
      return Response.json({ error: "email is already in use" }, { status: 409 });
    }
    throw error;
  }

  if (!updated) {
    return Response.json({ error: "failed to verify email" }, { status: 500 });
  }

  return Response.json({
    verified: true,
    pilot: toPublicPilot(updated),
  });
}
