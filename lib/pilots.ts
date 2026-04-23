import { getDb } from "@/lib/db";
import type { ExternalPilotProfile } from "@/lib/external-platform";

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export type PilotRecord = {
  id: number;
  source_pilot_id: number;
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
  created_at_external: string | null;
  deleted_at_external: string | null;
  statistics: unknown | null;
  password_hash: string | null;
  password_salt: string | null;
  password_algo: string | null;
  password_set_at: string | null;
  last_login_at: string | null;
  email: string | null;
  email_verified_at: string | null;
  email_verify_target: string | null;
  email_verify_code_hash: string | null;
  email_verify_code_salt: string | null;
  email_verify_expires_at: string | null;
  email_verify_sent_at: string | null;
  email_verify_attempts: number;
  current_airport_icao: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicPilot = Omit<
  PilotRecord,
  | "password_hash"
  | "password_salt"
  | "password_algo"
  | "email_verify_code_hash"
  | "email_verify_code_salt"
  | "email_verify_expires_at"
  | "email_verify_sent_at"
  | "email_verify_attempts"
> & {
  has_password: boolean;
};

export function toPublicPilot(record: PilotRecord): PublicPilot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    password_hash,
    password_salt,
    password_algo,
    email_verify_code_hash,
    email_verify_code_salt,
    email_verify_expires_at,
    email_verify_sent_at,
    email_verify_attempts,
    ...rest
  } = record;
  return {
    ...rest,
    has_password: Boolean(password_hash),
  };
}

export async function findPilotByUsername(username: string) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      SELECT *
      FROM pilots
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [username.trim()],
  );

  return result.rows[0] ?? null;
}

export async function findPilotByEmail(email: string) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      SELECT *
      FROM pilots
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email.trim()],
  );

  return result.rows[0] ?? null;
}

export async function findPilotById(id: number) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      SELECT *
      FROM pilots
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function createLocalPilotWithPassword(params: {
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  passwordAlgo: string;
}) {
  const db = getDb();
  const airlineId = Number.parseInt(process.env.LOCAL_REGISTER_AIRLINE_ID ?? "0", 10) || 0;
  const configuredDefaultRankId = Number.parseInt(
    process.env.LOCAL_REGISTER_DEFAULT_RANK_ID ?? "",
    10,
  );

  let defaultRankId: number | null = Number.isFinite(configuredDefaultRankId) && configuredDefaultRankId > 0
    ? configuredDefaultRankId
    : null;

  if (!defaultRankId && airlineId > 0) {
    const rankResult = await db.query<{ id: number }>(
      `
        SELECT id
        FROM ranks
        WHERE airline_id = $1
          AND COALESCE(honorary_rank, FALSE) = FALSE
        ORDER BY level ASC NULLS LAST, id ASC
        LIMIT 1
      `,
      [airlineId],
    );
    defaultRankId = rankResult.rows[0]?.id ?? null;
  }

  const result = await db.query<PilotRecord>(
    `
      INSERT INTO pilots (
        airline_id,
        rank_id,
        username,
        name,
        email,
        email_verified_at,
        password_hash,
        password_salt,
        password_algo,
        password_set_at,
        external_source
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, NOW(), $9)
      RETURNING *
    `,
    [
      airlineId,
      defaultRankId,
      params.username.trim().toUpperCase(),
      params.username.trim().toUpperCase(),
      params.email.trim().toLowerCase(),
      params.passwordHash,
      params.passwordSalt,
      params.passwordAlgo,
      "local-register",
    ],
  );

  return result.rows[0] ?? null;
}

export async function setPilotPasswordFirstTime(params: {
  pilotId: number;
  passwordHash: string;
  passwordSalt: string;
  passwordAlgo: string;
}) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      UPDATE pilots
      SET
        password_hash = $1,
        password_salt = $2,
        password_algo = $3,
        password_set_at = NOW()
      WHERE id = $4
        AND password_hash IS NULL
      RETURNING *
    `,
    [params.passwordHash, params.passwordSalt, params.passwordAlgo, params.pilotId],
  );

  return result.rows[0] ?? null;
}

export async function upsertPilotEmailVerification(params: {
  pilotId: number;
  email: string;
  codeHash: string;
  codeSalt: string;
  expiresAtIso: string;
}) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      UPDATE pilots
      SET
        email_verify_target = $1,
        email_verify_code_hash = $2,
        email_verify_code_salt = $3,
        email_verify_expires_at = $4::timestamptz,
        email_verify_sent_at = NOW(),
        email_verify_attempts = 0
      WHERE id = $5
      RETURNING *
    `,
    [params.email, params.codeHash, params.codeSalt, params.expiresAtIso, params.pilotId],
  );

  return result.rows[0] ?? null;
}

export async function bumpPilotEmailVerifyAttempts(pilotId: number) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      UPDATE pilots
      SET email_verify_attempts = COALESCE(email_verify_attempts, 0) + 1
      WHERE id = $1
      RETURNING *
    `,
    [pilotId],
  );

  return result.rows[0] ?? null;
}

export async function markPilotEmailVerified(params: {
  pilotId: number;
  email: string;
}) {
  const db = getDb();
  const result = await db.query<PilotRecord>(
    `
      UPDATE pilots
      SET
        email = $1,
        email_verified_at = NOW(),
        email_verify_target = NULL,
        email_verify_code_hash = NULL,
        email_verify_code_salt = NULL,
        email_verify_expires_at = NULL,
        email_verify_sent_at = NULL,
        email_verify_attempts = 0
      WHERE id = $2
      RETURNING *
    `,
    [params.email, params.pilotId],
  );

  return result.rows[0] ?? null;
}

export async function updatePilotLastLogin(pilotId: number) {
  const db = getDb();
  await db.query(
    `
      UPDATE pilots
      SET last_login_at = NOW()
      WHERE id = $1
    `,
    [pilotId],
  );
}

export async function updatePilotCurrentAirport(params: {
  pilotId: number;
  airportIcao: string | null;
  db?: Queryable;
}) {
  const db = params.db ?? getDb();
  const normalized = params.airportIcao?.trim().toUpperCase() ?? null;

  await db.query(
    `
      UPDATE pilots
      SET current_airport_icao = $1
      WHERE id = $2
    `,
    [normalized, params.pilotId],
  );
}

export async function upsertPilotFromExternal(params: {
  profile: ExternalPilotProfile;
  sourceName: string;
}) {
  const db = getDb();
  const p = params.profile;

  const result = await db.query<PilotRecord>(
    `
      INSERT INTO pilots (
        source_pilot_id,
        airline_id,
        user_id,
        username,
        name,
        discord_id,
        rank_id,
        honorary_rank_id,
        prefer_honorary_rank,
        hub_id,
        location_id,
        permanent_remove,
        frozen_date,
        airline_ban,
        platform_ban,
        holiday_allowance,
        under_activity_grace,
        activity_grace_since,
        activity_whitelist,
        activity_type,
        created_at_external,
        deleted_at_external,
        statistics,
        external_source,
        external_last_synced_at,
        external_raw
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24,
        NOW(), $25
      )
      ON CONFLICT (source_pilot_id) DO UPDATE SET
        airline_id = EXCLUDED.airline_id,
        user_id = EXCLUDED.user_id,
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        discord_id = EXCLUDED.discord_id,
        rank_id = EXCLUDED.rank_id,
        honorary_rank_id = EXCLUDED.honorary_rank_id,
        prefer_honorary_rank = EXCLUDED.prefer_honorary_rank,
        hub_id = EXCLUDED.hub_id,
        location_id = EXCLUDED.location_id,
        permanent_remove = EXCLUDED.permanent_remove,
        frozen_date = EXCLUDED.frozen_date,
        airline_ban = EXCLUDED.airline_ban,
        platform_ban = EXCLUDED.platform_ban,
        holiday_allowance = EXCLUDED.holiday_allowance,
        under_activity_grace = EXCLUDED.under_activity_grace,
        activity_grace_since = EXCLUDED.activity_grace_since,
        activity_whitelist = EXCLUDED.activity_whitelist,
        activity_type = EXCLUDED.activity_type,
        created_at_external = EXCLUDED.created_at_external,
        deleted_at_external = EXCLUDED.deleted_at_external,
        statistics = EXCLUDED.statistics,
        external_source = EXCLUDED.external_source,
        external_last_synced_at = NOW(),
        external_raw = EXCLUDED.external_raw
      RETURNING *
    `,
    [
      p.id,
      p.airline_id,
      p.user_id,
      p.username,
      p.name,
      p.discord_id,
      p.rank_id,
      p.honorary_rank_id,
      p.prefer_honorary_rank,
      p.hub_id,
      p.location_id,
      p.permanent_remove,
      p.frozen_date,
      p.airline_ban,
      p.platform_ban,
      p.holiday_allowance,
      p.under_activity_grace,
      p.activity_grace_since,
      p.activity_whitelist,
      p.activity_type,
      p.created_at,
      p.deleted_at,
      p.statistics ? JSON.stringify(p.statistics) : null,
      params.sourceName,
      JSON.stringify(p.raw),
    ],
  );

  return result.rows[0] ?? null;
}
