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
    throw new Error("Usage: node scripts/import-ranks-json.mjs <json-file-path>");
  }
  return path.resolve(filePath);
}

function parseInteger(value, fallback = null) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function parseTimestamp(value) {
  if (!value || String(value).trim() === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeString(value, maxLength = null) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (typeof maxLength === "number") return text.slice(0, maxLength);
  return text;
}

function normalizeRank(raw) {
  const sourceRankId = parseInteger(raw?.id);
  const airlineId = parseInteger(raw?.airline_id);
  const level = parseInteger(raw?.level);
  const name = normalizeString(raw?.name);

  if (!sourceRankId || !airlineId || !level || !name) {
    return null;
  }

  return {
    source_rank_id: sourceRankId,
    airline_id: airlineId,
    level,
    name,
    abbreviation: normalizeString(raw?.abbreviation, 32),
    description: normalizeString(raw?.description),
    image_url: normalizeString(raw?.image),
    honorary_rank: parseBoolean(raw?.honorary_rank, false),
    required_hours: parseInteger(raw?.hours, 0) ?? 0,
    required_points: parseInteger(raw?.points, 0) ?? 0,
    required_bonus: parseInteger(raw?.bonus, 0) ?? 0,
    required_pireps: parseInteger(raw?.pireps, 0) ?? 0,
    show_abbreviation: parseBoolean(raw?.show_abbreviation, true),
    abbreviation_position: normalizeString(raw?.abbreviation_position, 8),
    abbreviation_separator: normalizeString(raw?.abbreviation_separator, 16),
    regular_pilots_count: parseInteger(raw?.regular_pilots_count),
    honorary_pilots_count: parseInteger(raw?.honorary_pilots_count),
    source_created_at: parseTimestamp(raw?.created_at),
    source_updated_at: parseTimestamp(raw?.updated_at),
    raw_payload: raw,
  };
}

async function main() {
  const jsonPath = requireJsonPath();
  const content = await fs.readFile(jsonPath, "utf8");
  const parsed = JSON.parse(content);
  const rows = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];

  const ranks = rows.map(normalizeRank).filter(Boolean);
  if (ranks.length === 0) {
    throw new Error("No valid rank rows found in JSON");
  }

  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const rank of ranks) {
      await client.query(
        `
          INSERT INTO ranks (
            source_rank_id, airline_id, level, name, abbreviation, description, image_url,
            honorary_rank, required_hours, required_points, required_bonus, required_pireps,
            show_abbreviation, abbreviation_position, abbreviation_separator,
            regular_pilots_count, honorary_pilots_count, source_created_at, source_updated_at, raw_payload
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20::jsonb
          )
          ON CONFLICT (source_rank_id) DO UPDATE SET
            airline_id = EXCLUDED.airline_id,
            level = EXCLUDED.level,
            name = EXCLUDED.name,
            abbreviation = EXCLUDED.abbreviation,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            honorary_rank = EXCLUDED.honorary_rank,
            required_hours = EXCLUDED.required_hours,
            required_points = EXCLUDED.required_points,
            required_bonus = EXCLUDED.required_bonus,
            required_pireps = EXCLUDED.required_pireps,
            show_abbreviation = EXCLUDED.show_abbreviation,
            abbreviation_position = EXCLUDED.abbreviation_position,
            abbreviation_separator = EXCLUDED.abbreviation_separator,
            regular_pilots_count = EXCLUDED.regular_pilots_count,
            honorary_pilots_count = EXCLUDED.honorary_pilots_count,
            source_created_at = EXCLUDED.source_created_at,
            source_updated_at = EXCLUDED.source_updated_at,
            raw_payload = EXCLUDED.raw_payload
        `,
        [
          rank.source_rank_id,
          rank.airline_id,
          rank.level,
          rank.name,
          rank.abbreviation,
          rank.description,
          rank.image_url,
          rank.honorary_rank,
          rank.required_hours,
          rank.required_points,
          rank.required_bonus,
          rank.required_pireps,
          rank.show_abbreviation,
          rank.abbreviation_position,
          rank.abbreviation_separator,
          rank.regular_pilots_count,
          rank.honorary_pilots_count,
          rank.source_created_at,
          rank.source_updated_at,
          JSON.stringify(rank.raw_payload),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${ranks.length} rank rows from ${jsonPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
