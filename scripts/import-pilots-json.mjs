import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  return databaseUrl;
}

function requireJsonPath() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: node scripts/import-pilots-json.mjs <json-file-path>");
  }
  return path.resolve(filePath);
}

function parseTimestamp(value) {
  if (!value || String(value).trim() === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function normalizePilot(raw) {
  const sourcePilotId = Number.parseInt(String(raw?.id ?? ""), 10);
  if (Number.isNaN(sourcePilotId)) return null;

  return {
    source_pilot_id: sourcePilotId,
    airline_id: Number.parseInt(String(raw?.airline_id ?? "0"), 10),
    user_id: raw?.user_id ?? null,
    username: String(raw?.username ?? "").trim(),
    name: String(raw?.name ?? "").trim(),
    discord_id: raw?.discord_id ? String(raw.discord_id) : null,
    rank_id: raw?.rank_id ?? null,
    honorary_rank_id: raw?.honorary_rank_id ?? null,
    prefer_honorary_rank: toBoolean(raw?.prefer_honorary_rank, false),
    hub_id: raw?.hub_id ?? null,
    location_id: raw?.location_id ?? null,
    permanent_remove: toBoolean(raw?.permanent_remove, false),
    frozen_date: parseTimestamp(raw?.frozen_date),
    airline_ban: toBoolean(raw?.airline_ban, false),
    platform_ban: toBoolean(raw?.platform_ban, false),
    holiday_allowance: raw?.holiday_allowance ?? null,
    under_activity_grace: raw?.under_activity_grace ?? null,
    activity_grace_since: parseTimestamp(raw?.activity_grace_since),
    activity_whitelist: raw?.activity_whitelist ?? null,
    activity_type: raw?.activity_type ?? null,
    created_at_external: parseTimestamp(raw?.created_at),
    deleted_at_external: parseTimestamp(raw?.deleted_at),
    statistics: raw?.statistics ?? null,
  };
}

async function main() {
  const filePath = requireJsonPath();
  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  const rawItems = Array.isArray(parsed) ? parsed : [parsed];

  const pilots = rawItems
    .map(normalizePilot)
    .filter((item) => item && item.airline_id > 0 && item.username && item.name);

  if (pilots.length === 0) {
    throw new Error("No valid pilot rows found in JSON");
  }

  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const pilot of pilots) {
      await client.query(
        `
          INSERT INTO pilots (
            source_pilot_id, airline_id, user_id, username, name, discord_id, rank_id, honorary_rank_id,
            prefer_honorary_rank, hub_id, location_id, permanent_remove, frozen_date, airline_ban, platform_ban,
            holiday_allowance, under_activity_grace, activity_grace_since, activity_whitelist, activity_type,
            created_at_external, deleted_at_external, statistics
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            $21, $22, $23
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
            statistics = EXCLUDED.statistics
        `,
        [
          pilot.source_pilot_id,
          pilot.airline_id,
          pilot.user_id,
          pilot.username,
          pilot.name,
          pilot.discord_id,
          pilot.rank_id,
          pilot.honorary_rank_id,
          pilot.prefer_honorary_rank,
          pilot.hub_id,
          pilot.location_id,
          pilot.permanent_remove,
          pilot.frozen_date,
          pilot.airline_ban,
          pilot.platform_ban,
          pilot.holiday_allowance,
          pilot.under_activity_grace,
          pilot.activity_grace_since,
          pilot.activity_whitelist,
          pilot.activity_type,
          pilot.created_at_external,
          pilot.deleted_at_external,
          pilot.statistics ? JSON.stringify(pilot.statistics) : null,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${pilots.length} pilot rows from ${filePath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
