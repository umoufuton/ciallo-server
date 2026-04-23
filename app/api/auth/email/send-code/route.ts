import { hashPassword, verifyBootstrapToken } from "@/lib/auth";
import {
  createEmailVerificationCode,
  dispatchVerificationEmail,
  getEmailCodeExpiresAtIso,
  getEmailCodeTtlSeconds,
  validateEmailAddress,
} from "@/lib/email-verification";
import { findPilotByUsername, upsertPilotEmailVerification } from "@/lib/pilots";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_MS = 30_000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; bootstrapToken?: string; email?: string }
    | null;

  const username = body?.username?.trim();
  const bootstrapToken = body?.bootstrapToken?.trim();
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

  const pilot = await findPilotByUsername(username);
  if (!pilot) {
    return Response.json({ error: "pilot not found" }, { status: 404 });
  }

  if (pilot.password_hash) {
    return Response.json({ error: "password already set" }, { status: 409 });
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

  const sentAt = pilot.email_verify_sent_at ? new Date(pilot.email_verify_sent_at).getTime() : 0;
  if (sentAt > 0 && Date.now() - sentAt < RESEND_COOLDOWN_MS) {
    return Response.json({ error: "please wait before requesting another code" }, { status: 429 });
  }

  const code = createEmailVerificationCode();
  const hashed = await hashPassword(code);
  const expiresAtIso = getEmailCodeExpiresAtIso();

  const updated = await upsertPilotEmailVerification({
    pilotId: pilot.id,
    email: emailCheck.normalized,
    codeHash: hashed.passwordHash,
    codeSalt: hashed.passwordSalt,
    expiresAtIso,
  });

  if (!updated) {
    return Response.json({ error: "failed to save verification state" }, { status: 500 });
  }

  const delivery = await dispatchVerificationEmail({
    toEmail: emailCheck.normalized,
    username: pilot.username,
    code,
  });

  return Response.json({
    sent: true,
    delivered: delivery.delivered,
    provider: delivery.provider,
    expiresInSeconds: getEmailCodeTtlSeconds(),
  });
}
