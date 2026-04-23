import { hashPassword } from "@/lib/auth";
import {
  createEmailVerificationCode,
  dispatchVerificationEmail,
  getEmailCodeExpiresAtIso,
  getEmailCodeTtlSeconds,
  validateEmailAddress,
} from "@/lib/email-verification";
import { findPilotByEmail, findPilotByUsername } from "@/lib/pilots";
import {
  getRegisterVerificationByUsername,
  upsertRegisterVerification,
} from "@/lib/register-verification";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_MS = 30_000;

function validateUsername(username: string) {
  const normalized = username.trim().toUpperCase();
  if (!normalized) return { ok: false as const, reason: "username is required" };
  if (!/^[A-Z0-9_ ]{3,32}$/.test(normalized)) {
    return { ok: false as const, reason: "username must be 3-32 chars (A-Z, 0-9, _, space)" };
  }
  return { ok: true as const, normalized };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { username?: string; email?: string }
      | null;

    const usernameCheck = validateUsername(body?.username ?? "");
    const emailCheck = validateEmailAddress(body?.email ?? "");

    if (!usernameCheck.ok) {
      return Response.json({ error: usernameCheck.reason }, { status: 400 });
    }
    if (!emailCheck.ok) {
      return Response.json({ error: emailCheck.reason }, { status: 400 });
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
    const sentAt = pending?.sent_at ? new Date(pending.sent_at).getTime() : 0;
    if (sentAt > 0 && Date.now() - sentAt < RESEND_COOLDOWN_MS) {
      return Response.json({ error: "please wait before requesting another code" }, { status: 429 });
    }

    const code = createEmailVerificationCode();
    const hashed = await hashPassword(code);
    const expiresAtIso = getEmailCodeExpiresAtIso();

    const updated = await upsertRegisterVerification({
      username: usernameCheck.normalized,
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
      username: usernameCheck.normalized,
      code,
    });

    return Response.json({
      sent: true,
      delivered: delivery.delivered,
      provider: delivery.provider,
      expiresInSeconds: getEmailCodeTtlSeconds(),
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : "";

    const message = error instanceof Error ? error.message : "failed to send register verification code";

    if (code === "42P01") {
      return Response.json(
        { error: "register verification table missing, run migrations", detail: message },
        { status: 500 },
      );
    }

    if (message.includes("tencent ses send failed") || message.includes("RESEND_")) {
      return Response.json({ error: "email provider send failed", detail: message }, { status: 503 });
    }

    return Response.json({ error: "failed to send register verification code", detail: message }, { status: 500 });
  }
}
