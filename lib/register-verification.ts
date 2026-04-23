import { getDb } from "@/lib/db";

export type RegisterEmailVerificationRecord = {
  id: number;
  username: string;
  email: string;
  code_hash: string;
  code_salt: string;
  expires_at: string;
  sent_at: string;
  attempts: number;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getRegisterVerificationByUsername(username: string) {
  const db = getDb();
  const result = await db.query<RegisterEmailVerificationRecord>(
    `
      SELECT *
      FROM register_email_verifications
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [username.trim()],
  );
  return result.rows[0] ?? null;
}

export async function upsertRegisterVerification(params: {
  username: string;
  email: string;
  codeHash: string;
  codeSalt: string;
  expiresAtIso: string;
}) {
  const db = getDb();
  const result = await db.query<RegisterEmailVerificationRecord>(
    `
      INSERT INTO register_email_verifications (
        username,
        email,
        code_hash,
        code_salt,
        expires_at,
        sent_at,
        attempts,
        verified_at
      ) VALUES ($1, $2, $3, $4, $5::timestamptz, NOW(), 0, NULL)
      ON CONFLICT ((LOWER(username))) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        code_hash = EXCLUDED.code_hash,
        code_salt = EXCLUDED.code_salt,
        expires_at = EXCLUDED.expires_at,
        sent_at = NOW(),
        attempts = 0,
        verified_at = NULL
      RETURNING *
    `,
    [
      params.username.trim().toUpperCase(),
      params.email.trim().toLowerCase(),
      params.codeHash,
      params.codeSalt,
      params.expiresAtIso,
    ],
  );
  return result.rows[0] ?? null;
}

export async function bumpRegisterVerificationAttempts(id: number) {
  const db = getDb();
  const result = await db.query<RegisterEmailVerificationRecord>(
    `
      UPDATE register_email_verifications
      SET attempts = attempts + 1
      WHERE id = $1
      RETURNING *
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function markRegisterVerificationVerified(id: number) {
  const db = getDb();
  const result = await db.query<RegisterEmailVerificationRecord>(
    `
      UPDATE register_email_verifications
      SET verified_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function consumeVerifiedRegisterVerification(params: {
  username: string;
  email: string;
}) {
  const db = getDb();
  const result = await db.query<RegisterEmailVerificationRecord>(
    `
      DELETE FROM register_email_verifications
      WHERE LOWER(username) = LOWER($1)
        AND LOWER(email) = LOWER($2)
        AND verified_at IS NOT NULL
        AND expires_at > NOW()
      RETURNING *
    `,
    [params.username.trim(), params.email.trim()],
  );
  return result.rows[0] ?? null;
}
