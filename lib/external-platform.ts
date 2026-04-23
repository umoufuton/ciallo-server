export type ExternalPilotProfile = {
  id: number;
  airline_id: number;
  user_id: number | null;
  username: string;
  name: string;
  discord_id: string | null;
  rank_id: number | null;
  honorary_rank_id: number | null;
  prefer_honorary_rank: boolean;
  hub_id: number | null;
  location_id: number | null;
  permanent_remove: boolean;
  frozen_date: string | null;
  airline_ban: boolean;
  platform_ban: boolean;
  holiday_allowance: number | null;
  under_activity_grace: boolean | null;
  activity_grace_since: string | null;
  activity_whitelist: boolean | null;
  activity_type: string | null;
  created_at: string | null;
  deleted_at: string | null;
  statistics: unknown | null;
  raw: unknown;
};

type ExternalUserPayload = {
  pilot?: Record<string, unknown> | null;
} & Record<string, unknown>;

type OpsAccessTokenPayload = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type OpsAccessTokenCache = {
  token: string;
  expiresAtMs: number;
};

type OpsCursorMeta = {
  next_cursor?: string | null;
};

type OpsCursorResponse<T> = {
  data?: T[];
  meta?: OpsCursorMeta | null;
};

let opsAccessTokenCache: OpsAccessTokenCache | null = null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is not set`);
  }
  return value.trim();
}

function readEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) return null;
  return value.trim();
}

function hasOpsClientCredentialsConfig() {
  return Boolean(readEnv("OPS_CLIENT_ID") && readEnv("OPS_CLIENT_SECRET"));
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number.parseInt(String(value), 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function ensureSuccessStatus(response: Response, context: string) {
  if (!response.ok) {
    throw new Error(`${context} failed with status ${response.status}`);
  }
}

function extractPayload<T>(input: unknown): T {
  if (input && typeof input === "object" && "data" in (input as Record<string, unknown>)) {
    return (input as { data: T }).data;
  }

  return input as T;
}

function extractSinglePilotRecord(input: unknown): Record<string, unknown> | null {
  const payload = extractPayload<unknown>(input);

  if (Array.isArray(payload)) {
    const first = payload[0];
    if (!first || typeof first !== "object") return null;
    return first as Record<string, unknown>;
  }

  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

function normalizeExternalPilot(input: unknown): ExternalPilotProfile {
  const pilot = extractSinglePilotRecord(input);
  if (!pilot) {
    throw new Error("External pilot payload missing required fields");
  }

  const id = normalizeNullableNumber(pilot.id);
  const airlineId = normalizeNullableNumber(pilot.airline_id);
  const username = normalizeNullableString(pilot.username);
  const name =
    normalizeNullableString(pilot.name) ??
    normalizeNullableString(pilot.display_name) ??
    normalizeNullableString(pilot.callsign) ??
    username ??
    "Unknown";

  if (!id || !airlineId || !username) {
    throw new Error("External pilot payload missing required fields");
  }

  return {
    id,
    airline_id: airlineId,
    user_id: normalizeNullableNumber(pilot.user_id),
    username,
    name,
    discord_id: normalizeNullableString(pilot.discord_id),
    rank_id: normalizeNullableNumber(pilot.rank_id),
    honorary_rank_id: normalizeNullableNumber(pilot.honorary_rank_id),
    prefer_honorary_rank: normalizeBoolean(pilot.prefer_honorary_rank, false),
    hub_id: normalizeNullableNumber(pilot.hub_id),
    location_id: normalizeNullableNumber(pilot.location_id),
    permanent_remove: normalizeBoolean(pilot.permanent_remove, false),
    frozen_date: normalizeNullableString(pilot.frozen_date),
    airline_ban: normalizeBoolean(pilot.airline_ban ?? pilot.banned, false),
    platform_ban: normalizeBoolean(pilot.platform_ban ?? pilot.banned, false),
    holiday_allowance: normalizeNullableNumber(pilot.holiday_allowance),
    under_activity_grace:
      pilot.under_activity_grace === null || pilot.under_activity_grace === undefined
        ? null
        : normalizeBoolean(pilot.under_activity_grace, false),
    activity_grace_since: normalizeNullableString(pilot.activity_grace_since),
    activity_whitelist:
      pilot.activity_whitelist === null || pilot.activity_whitelist === undefined
        ? null
        : normalizeBoolean(pilot.activity_whitelist, false),
    activity_type: normalizeNullableString(pilot.activity_type),
    created_at: normalizeNullableString(pilot.created_at),
    deleted_at: normalizeNullableString(pilot.deleted_at),
    statistics: pilot.statistics ?? null,
    raw: input,
  };
}

function buildHeaders(extra?: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };

  const apiKey = process.env.EXTERNAL_PLATFORM_API_KEY;
  if (apiKey && apiKey.trim()) {
    headers["X-API-Key"] = apiKey.trim();
  }

  return headers;
}

function buildOpsPilotLookupUrl(username: string) {
  const encodedUsername = encodeURIComponent(username);
  const pathTemplate = readEnv("OPS_PILOT_BY_USERNAME_PATH") ?? "/pilots?filter[username]={username}&page[size]=1";
  const path = pathTemplate.replace("{username}", encodedUsername);

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const base = readEnv("OPS_API_BASE_URL") ?? "https://vamsys.io/api/v3/operations";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildOpsApiUrl(pathWithQuery: string) {
  if (pathWithQuery.startsWith("http://") || pathWithQuery.startsWith("https://")) {
    return pathWithQuery;
  }

  const base = readEnv("OPS_API_BASE_URL") ?? "https://vamsys.io/api/v3/operations";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function getOpsAccessToken() {
  const now = Date.now();
  if (opsAccessTokenCache && now < opsAccessTokenCache.expiresAtMs) {
    return opsAccessTokenCache.token;
  }

  const tokenUrl = readEnv("OPS_OAUTH_TOKEN_URL") ?? "https://vamsys.io/oauth/token";
  const clientId = requireEnv("OPS_CLIENT_ID");
  const clientSecret = requireEnv("OPS_CLIENT_SECRET");
  const scope = readEnv("OPS_SCOPE");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (scope) body.set("scope", scope);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  ensureSuccessStatus(response, "getOpsAccessToken");
  const payload = (await response.json()) as OpsAccessTokenPayload;
  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("getOpsAccessToken returned empty access_token");
  }

  const expiresInSeconds =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? Math.max(60, payload.expires_in)
      : 3600;

  opsAccessTokenCache = {
    token: accessToken,
    expiresAtMs: now + (expiresInSeconds - 30) * 1000,
  };

  return accessToken;
}

async function fetchExternalPilotByUsernameViaOps(username: string) {
  const token = await getOpsAccessToken();
  const url = buildOpsPilotLookupUrl(username);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    opsAccessTokenCache = null;
  }

  if (response.status === 404) {
    return null;
  }

  ensureSuccessStatus(response, "fetchExternalPilotByUsernameViaOps");
  const json = (await response.json()) as unknown;
  const pilotRecord = extractSinglePilotRecord(json);
  if (!pilotRecord) return null;
  return normalizeExternalPilot(pilotRecord);
}

export async function fetchExternalPilotByUsername(username: string) {
  if (hasOpsClientCredentialsConfig()) {
    return fetchExternalPilotByUsernameViaOps(username);
  }

  const baseUrl = requireEnv("EXTERNAL_PLATFORM_PILOT_URL");
  const url = baseUrl.includes("{username}")
    ? baseUrl.replace("{username}", encodeURIComponent(username))
    : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}username=${encodeURIComponent(username)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  ensureSuccessStatus(response, "fetchExternalPilotByUsername");
  const json = (await response.json()) as unknown;
  return normalizeExternalPilot(json);
}

export async function verifyExternalIdentity(params: { username: string; externalToken: string }) {
  const verifyUrl = requireEnv("EXTERNAL_PLATFORM_VERIFY_URL");
  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      username: params.username,
      token: params.externalToken,
    }),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    return {
      success: false,
      reason: "invalid_external_credentials",
    } as const;
  }

  ensureSuccessStatus(response, "verifyExternalIdentity");
  const json = (await response.json()) as unknown;
  const payload = extractPayload<Record<string, unknown>>(json);
  const ok = payload?.ok === undefined ? true : Boolean(payload.ok);

  return {
    success: ok,
    reason: ok ? null : "external_verification_failed",
  } as const;
}

function extractPilotFromUserPayload(input: unknown) {
  const payload = extractPayload<Record<string, unknown>>(input as Record<string, unknown>);

  if (payload?.pilot && typeof payload.pilot === "object") {
    return normalizeExternalPilot(payload.pilot);
  }

  const nestedUser = payload?.user;
  if (
    nestedUser &&
    typeof nestedUser === "object" &&
    "pilot" in nestedUser &&
    (nestedUser as Record<string, unknown>).pilot &&
    typeof (nestedUser as Record<string, unknown>).pilot === "object"
  ) {
    return normalizeExternalPilot((nestedUser as Record<string, unknown>).pilot);
  }

  const user = payload as ExternalUserPayload;
  if (!user?.pilot || typeof user.pilot !== "object") {
    return null;
  }
  return normalizeExternalPilot(user.pilot);
}

export async function verifyExternalIdentityByAccessToken(params: {
  username: string;
  accessToken: string;
}) {
  const userInfoUrl = requireEnv("EXTERNAL_PLATFORM_USERINFO_URL");
  const response = await fetch(userInfoUrl, {
    method: "GET",
    headers: buildHeaders({
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
    }),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    return {
      success: false,
      reason: "invalid_external_access_token",
      profile: null,
    } as const;
  }

  ensureSuccessStatus(response, "verifyExternalIdentityByAccessToken");
  const json = (await response.json()) as unknown;
  const profile = extractPilotFromUserPayload(json);

  if (!profile) {
    const shape =
      json && typeof json === "object" ? Object.keys(json as Record<string, unknown>).join(",") : typeof json;
    return {
      success: false,
      reason: `pilot_scope_or_profile_missing (response shape: ${shape})`,
      profile: null,
    } as const;
  }

  if (profile.username.toLowerCase() !== params.username.toLowerCase()) {
    return {
      success: false,
      reason: "username_mismatch",
      profile: null,
    } as const;
  }

  return {
    success: true,
    reason: null,
    profile,
  } as const;
}

export async function fetchOpsPirepsByPilotId(params: {
  sourcePilotId: number;
  cursor?: string | null;
  pageSize?: number;
}) {
  if (!hasOpsClientCredentialsConfig()) {
    throw new Error("OPS client credentials are not configured");
  }

  const token = await getOpsAccessToken();
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 100);
  const query = new URLSearchParams();
  query.set("filter[pilot_id]", String(params.sourcePilotId));
  query.set("sort", "-id");
  query.set("page[size]", String(pageSize));
  if (params.cursor) query.set("page[cursor]", params.cursor);

  const url = buildOpsApiUrl(`/pireps?${query.toString()}`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    opsAccessTokenCache = null;
  }

  ensureSuccessStatus(response, "fetchOpsPirepsByPilotId");
  const json = (await response.json()) as OpsCursorResponse<Record<string, unknown>>;
  const items = Array.isArray(json?.data) ? json.data : [];

  return {
    items,
    nextCursor: json?.meta?.next_cursor ?? null,
  };
}

export async function fetchOpsPirepDetailById(pirepId: number) {
  if (!hasOpsClientCredentialsConfig()) {
    throw new Error("OPS client credentials are not configured");
  }

  const token = await getOpsAccessToken();
  const url = buildOpsApiUrl(`/pireps/${pirepId}`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    opsAccessTokenCache = null;
  }

  ensureSuccessStatus(response, "fetchOpsPirepDetailById");
  return (await response.json()) as unknown;
}

export async function fetchOpsPirepPositionReportsById(pirepId: number) {
  if (!hasOpsClientCredentialsConfig()) {
    throw new Error("OPS client credentials are not configured");
  }

  const token = await getOpsAccessToken();
  const url = buildOpsApiUrl(`/pireps/${pirepId}/position-reports`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    opsAccessTokenCache = null;
  }

  ensureSuccessStatus(response, "fetchOpsPirepPositionReportsById");
  const json = (await response.json()) as unknown;
  const payload = extractPayload<unknown>(json);

  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    Array.isArray((payload as Record<string, unknown>).data)
  ) {
    return (payload as { data: Record<string, unknown>[] }).data;
  }

  return [];
}
