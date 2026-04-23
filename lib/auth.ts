import crypto from "node:crypto";

const TOKEN_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const SCRYPT_KEYLEN = 64;

export type AuthTokenPayload = {
  sub: number;
  username: string;
  iat: number;
  exp: number;
};

export type BootstrapTokenPayload = {
  purpose: "password_bootstrap";
  pilot_id: number;
  username: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: Buffer | string) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return source
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function getAuthSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-auth-token-secret-change-in-production";
  }

  throw new Error("AUTH_TOKEN_SECRET is not set or too short");
}

function getTokenTtlSeconds() {
  const value = Number.parseInt(process.env.AUTH_TOKEN_TTL_SECONDS ?? "", 10);
  if (!Number.isNaN(value) && value > 60) return value;
  return TOKEN_DEFAULT_TTL_SECONDS;
}

function signToken(unsignedToken: string, secret: string) {
  return base64UrlEncode(crypto.createHmac("sha256", secret).update(unsignedToken).digest());
}

export function issueAuthToken(claims: { pilotId: number; username: string }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = getTokenTtlSeconds();
  const payload: AuthTokenPayload = {
    sub: claims.pilotId,
    username: claims.username,
    iat: now,
    exp: now + ttl,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = signToken(unsigned, getAuthSecret());

  return {
    token: `${unsigned}.${signature}`,
    expiresInSeconds: ttl,
    payload,
  };
}

export function issueBootstrapToken(claims: { pilotId: number; username: string }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = 10 * 60;
  const payload: BootstrapTokenPayload = {
    purpose: "password_bootstrap",
    pilot_id: claims.pilotId,
    username: claims.username,
    iat: now,
    exp: now + ttl,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = signToken(unsigned, getAuthSecret());

  return {
    token: `${unsigned}.${signature}`,
    expiresInSeconds: ttl,
    payload,
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerPart, bodyPart, signaturePart] = parts;
  const expectedSignature = signToken(`${headerPart}.${bodyPart}`, getAuthSecret());
  const a = Buffer.from(signaturePart);
  const b = Buffer.from(expectedSignature);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(bodyPart).toString("utf8")) as AuthTokenPayload;
  if (!payload?.sub || !payload?.username || !payload?.exp) {
    throw new Error("Invalid token payload");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}

export function verifyBootstrapToken(token: string): BootstrapTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerPart, bodyPart, signaturePart] = parts;
  const expectedSignature = signToken(`${headerPart}.${bodyPart}`, getAuthSecret());
  const a = Buffer.from(signaturePart);
  const b = Buffer.from(expectedSignature);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(bodyPart).toString("utf8")) as BootstrapTokenPayload;
  if (payload?.purpose !== "password_bootstrap" || !payload?.pilot_id || !payload?.username || !payload?.exp) {
    throw new Error("Invalid bootstrap token payload");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hashBuffer = (await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (error, key) => {
      if (error) return reject(error);
      resolve(key as Buffer);
    });
  })) as Buffer;

  return {
    passwordHash: hashBuffer.toString("hex"),
    passwordSalt: salt,
    passwordAlgo: "scrypt-sha256",
  };
}

export async function verifyPassword(password: string, passwordHash: string, passwordSalt: string) {
  const incoming = (await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, passwordSalt, SCRYPT_KEYLEN, (error, key) => {
      if (error) return reject(error);
      resolve(key as Buffer);
    });
  })) as Buffer;

  const existing = Buffer.from(passwordHash, "hex");
  return incoming.length === existing.length && crypto.timingSafeEqual(incoming, existing);
}

export function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
