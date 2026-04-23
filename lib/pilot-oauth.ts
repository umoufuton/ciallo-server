import crypto from "node:crypto";

export type PilotOauthSession = {
  state: string;
  username: string;
  codeVerifier: string;
  createdAtMs: number;
  expiresAtMs: number;
  status: "pending" | "processing" | "token_ready" | "verified" | "failed";
  accessToken: string | null;
  bootstrapToken: string | null;
  bootstrapExpiresInSeconds: number | null;
  error: string | null;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map<string, PilotOauthSession>();

function base64UrlEncode(input: Buffer | string) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return source
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [state, session] of sessions.entries()) {
    if (session.expiresAtMs <= now) {
      sessions.delete(state);
    }
  }
}

function getEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is not set`);
}

function generateCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(48));
}

function generateCodeChallenge(codeVerifier: string) {
  return base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());
}

function generateState() {
  return base64UrlEncode(crypto.randomBytes(24));
}

export function createPilotOauthSession(username: string) {
  cleanupExpiredSessions();
  const normalizedUsername = username.trim().toUpperCase();
  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const now = Date.now();

  const session: PilotOauthSession = {
    state,
    username: normalizedUsername,
    codeVerifier,
    createdAtMs: now,
    expiresAtMs: now + SESSION_TTL_MS,
    status: "pending",
    accessToken: null,
    bootstrapToken: null,
    bootstrapExpiresInSeconds: null,
    error: null,
  };

  sessions.set(state, session);

  const authorizeUrl = new URL(
    getEnv("PILOT_OAUTH_AUTHORIZE_URL", "https://vamsys.io/oauth/authorize"),
  );
  authorizeUrl.searchParams.set("client_id", getEnv("PILOT_OAUTH_CLIENT_ID"));
  authorizeUrl.searchParams.set("redirect_uri", getEnv("PILOT_OAUTH_REDIRECT_URI"));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "scope",
    getEnv("PILOT_OAUTH_SCOPE", "identity:basic pilot:read"),
  );
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return {
    state,
    username: normalizedUsername,
    authorizeUrl: authorizeUrl.toString(),
    expiresInSeconds: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function getPilotOauthSession(state: string) {
  cleanupExpiredSessions();
  return sessions.get(state) ?? null;
}

export function setPilotOauthSessionFailed(state: string, error: string) {
  const session = sessions.get(state);
  if (!session) return;
  session.status = "failed";
  session.error = error;
}

export function setPilotOauthSessionAccessToken(state: string, accessToken: string) {
  const session = sessions.get(state);
  if (!session) return;
  session.status = "token_ready";
  session.accessToken = accessToken;
  session.error = null;
}

export function setPilotOauthSessionProcessing(state: string) {
  const session = sessions.get(state);
  if (!session) return;
  session.status = "processing";
}

export function setPilotOauthSessionBootstrap(
  state: string,
  bootstrapToken: string,
  expiresInSeconds: number,
) {
  const session = sessions.get(state);
  if (!session) return;
  session.status = "verified";
  session.bootstrapToken = bootstrapToken;
  session.bootstrapExpiresInSeconds = expiresInSeconds;
  session.error = null;
}

export async function exchangePilotOauthCodeForAccessToken(params: {
  state: string;
  code: string;
}) {
  const session = getPilotOauthSession(params.state);
  if (!session) {
    throw new Error("oauth session not found or expired");
  }

  const tokenUrl = getEnv("PILOT_OAUTH_TOKEN_URL", "https://vamsys.io/oauth/token");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getEnv("PILOT_OAUTH_CLIENT_ID"),
    redirect_uri: getEnv("PILOT_OAUTH_REDIRECT_URI"),
    code: params.code,
    code_verifier: session.codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error?: string; message?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    const reason = payload?.error || payload?.message || `oauth token exchange failed ${response.status}`;
    throw new Error(reason);
  }

  setPilotOauthSessionAccessToken(params.state, payload.access_token);
}
