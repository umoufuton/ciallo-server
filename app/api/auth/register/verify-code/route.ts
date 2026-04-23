import { verifyPassword } from "@/lib/auth";
import { validateEmailAddress } from "@/lib/email-verification";
import { findPilotByEmail, findPilotByUsername } from "@/lib/pilots";
import {
  bumpRegisterVerificationAttempts,
  getRegisterVerificationByUsername,
  markRegisterVerificationVerified,
} from "@/lib/register-verification";

export const dynamic = "force-dynamic";

const MAX_VERIFY_ATTEMPTS = 8;

function validateUsername(username: string) {
  const normalized = username.trim().toUpperCase();
  if (!normalized) return { ok: false as const, reason: "username is required" };
  if (!/^[A-Z0-9_ ]{3,32}$/.test(normalized)) {
    return { ok: false as const, reason: "username must be 3-32 chars (A-Z, 0-9, _, space)" };
  }
  return { ok: true as const, normalized };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; email?: string; code?: string }
    | null;
  const usernameCheck = validateUsername(body?.username ?? "");
  const emailCheck = validateEmailAddress(body?.email ?? "");
  const code = body?.code?.trim() ?? "";

  if (!usernameCheck.ok) {
    return Response.json({ error: usernameCheck.reason }, { status: 400 });
  }
  if (!emailCheck.ok) {
    return Response.json({ error: emailCheck.reason }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ error: "verification code must be 6 digits" }, { status: 400 });
  }

  const existingByUsername = await findPilotByUsername(usernameCheck.normalized);
  if (existingByUsername) {
    return Response.json({ error: "username already exists" }, { status: 409 });
  }

  const existingByEmail = await findPilotByEmail(emailCheck.normalized);
  if (existingByEmail) {
    return Response.json({ error: "email already registered" }, { status: 409 });
  }

  const pending = await getRegisterVerificationByUsername(usernameCheck.normalized);
  if (!pending) {
    return Response.json({ error: "verification code not requested" }, { status: 409 });
  }

  if (pending.email.toLowerCase() !== emailCheck.normalized.toLowerCase()) {
    return Response.json({ error: "email does not match pending verification target" }, { status: 409 });
  }

  if (pending.attempts >= MAX_VERIFY_ATTEMPTS) {
    return Response.json({ error: "too many verification attempts, resend code" }, { status: 429 });
  }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "verification code expired" }, { status: 410 });
  }

  const ok = await verifyPassword(code, pending.code_hash, pending.code_salt);
  if (!ok) {
    await bumpRegisterVerificationAttempts(pending.id);
    return Response.json({ error: "invalid verification code" }, { status: 401 });
  }

  const verified = await markRegisterVerificationVerified(pending.id);
  if (!verified) {
    return Response.json({ error: "failed to mark verification" }, { status: 500 });
  }

  return Response.json({
    verified: true,
  });
}
