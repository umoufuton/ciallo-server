import { hashPassword, issueAuthToken } from "@/lib/auth";
import { createLocalPilotWithPassword, toPublicPilot } from "@/lib/pilots";
import { consumeVerifiedRegisterVerification } from "@/lib/register-verification";

export const dynamic = "force-dynamic";

function validatePassword(password: string) {
  if (password.length < 8) return "password length must be at least 8";
  if (password.length > 128) return "password length must be <= 128";
  return null;
}

function validateEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!value) return { ok: false as const, reason: "email is required" };
  if (value.length > 254) return { ok: false as const, reason: "email is too long" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false as const, reason: "invalid email format" };
  return { ok: true as const, value };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; email?: string; password?: string }
    | null;
  const username = body?.username?.trim().toUpperCase() ?? "";
  const emailRaw = body?.email ?? "";
  const password = body?.password ?? "";

  if (!username) {
    return Response.json({ error: "username is required" }, { status: 400 });
  }

  if (!/^[A-Z0-9_ ]{3,32}$/.test(username)) {
    return Response.json({ error: "username must be 3-32 chars (A-Z, 0-9, _, space)" }, { status: 400 });
  }

  const email = validateEmail(emailRaw);
  if (!email.ok) {
    return Response.json({ error: email.reason }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }

  const hashed = await hashPassword(password);

  const consumed = await consumeVerifiedRegisterVerification({
    username,
    email: email.value,
  });
  if (!consumed) {
    return Response.json({ error: "email not verified for register" }, { status: 409 });
  }

  try {
    const created = await createLocalPilotWithPassword({
      username,
      email: email.value,
      passwordHash: hashed.passwordHash,
      passwordSalt: hashed.passwordSalt,
      passwordAlgo: hashed.passwordAlgo,
    });

    if (!created) {
      return Response.json({ error: "failed to create account" }, { status: 500 });
    }

    const token = issueAuthToken({
      pilotId: created.id,
      username: created.username,
    });

    return Response.json({
      token: token.token,
      expiresInSeconds: token.expiresInSeconds,
      pilot: toPublicPilot(created),
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    const constraint =
      typeof error === "object" && error && "constraint" in error
        ? String((error as { constraint?: string }).constraint ?? "")
        : "";

    if (code === "23505") {
      if (constraint.includes("ux_pilots_email_lower")) {
        return Response.json({ error: "email already registered" }, { status: 409 });
      }
      if (constraint.includes("ux_pilots_username_lower")) {
        return Response.json({ error: "username already exists" }, { status: 409 });
      }
      return Response.json({ error: "account already exists" }, { status: 409 });
    }

    throw error;
  }
}
