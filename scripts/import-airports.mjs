import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import pg from "pg";

const { Client } = pg;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  return databaseUrl;
}

function requireCsvPath() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    throw new Error("Usage: node scripts/import-airports.mjs <csv-file-path>");
  }

  return path.resolve(csvPath);
}

function parseBoolean(value) {
  if (!value) return false;
  return String(value).trim().toUpperCase() === "TRUE";
}

function parseInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTimestamp(value) {
  if (!value || String(value).trim() === "") return null;
  const [datePart, timePart = "00:00"] = String(value).trim().split(" ");
  const [day, month, year] = datePart.split("/");

  if (!day || !month || !year) return null;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${timePart}:00`;
}

function mapRecord(record) {
  const airportCode = String(record["ICAO/IATA"] ?? "").trim().toUpperCase();

  if (!airportCode) {
    return null;
  }

  return {
    icao_code: airportCode,
    iata_code: String(record["Info-Airport IATA"] ?? "").trim().toUpperCase() || null,
    name: String(record["Name"] ?? "").trim(),
    category: String(record["Category"] ?? "").trim() || null,
    is_base: parseBoolean(record["Base"]),
    is_suitable_alternate: parseBoolean(record["Suitable Alternate"]),
    airport_briefing_url: String(record["Airport Briefing URL"] ?? "").trim() || null,
    taxi_in_minutes: parseInteger(record["Taxi In Minutes"]),
    taxi_out_minutes: parseInteger(record["Taxi Out Minutes"]),
    preferred_alternates: String(record["Preferred Alternates"] ?? "").trim() || null,
    sb_alt_radius: parseInteger(record["SB Alt Radius"]),
    sb_alt_min_ceiling: parseInteger(record["SB Alt Min Ceiling"]),
    sb_alt_min_rwy_length: parseInteger(record["SB Alt Min Rwy Length"]),
    sb_alt_avoid_bad_weather: parseBoolean(record["SB Alt Avoid Bad Weather"]),
    sb_alt_exclude_airports: String(record["SB Alt Exclude Airports"] ?? "").trim() || null,
    sb_takeoff_alt_code: String(record["SB Takeoff Altn ICAO/IATA"] ?? "").trim().toUpperCase() || null,
    sb_alt_1_code: String(record["SB Altn 1 ICAO/IATA"] ?? "").trim().toUpperCase() || null,
    sb_alt_2_code: String(record["SB Altn 2 ICAO/IATA"] ?? "").trim().toUpperCase() || null,
    sb_alt_3_code: String(record["SB Altn 3 ICAO/IATA"] ?? "").trim().toUpperCase() || null,
    sb_alt_4_code: String(record["SB Altn 4 ICAO/IATA"] ?? "").trim().toUpperCase() || null,
    passenger_lf_id: parseInteger(record["Passenger LF ID"]),
    luggage_lf_id: parseInteger(record["Luggage LF ID"]),
    cargo_weight_lf_id: parseInteger(record["Cargo (Weight) LF ID"]),
    cargo_volume_lf_id: parseInteger(record["Cargo (Volume) LF ID"]),
    container_ids: String(record["Container IDs"] ?? "").trim() || null,
    source_deleted: parseBoolean(record["_delete"]),
    source_airport_id: parseInteger(record["Info-Airport ID"]),
    source_airport_icao: String(record["Info-Airport ICAO"] ?? "").trim().toUpperCase() || null,
    source_airport_iata: String(record["Info-Airport IATA"] ?? "").trim().toUpperCase() || null,
    source_created_at: parseTimestamp(record["Info-Created"]),
    source_updated_at: parseTimestamp(record["Info-Updated"]),
  };
}

async function main() {
  const csvPath = requireCsvPath();
  const csvText = await fs.readFile(csvPath, "utf8");
  const records = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const airports = records
    .map(mapRecord)
    .filter((record) => record && record.name);

  if (airports.length === 0) {
    throw new Error("No valid airport rows found in CSV");
  }

  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const airport of airports) {
      await client.query(
        `
          INSERT INTO airports (
            icao_code,
            iata_code,
            name,
            category,
            is_base,
            is_suitable_alternate,
            airport_briefing_url,
            taxi_in_minutes,
            taxi_out_minutes,
            preferred_alternates,
            sb_alt_radius,
            sb_alt_min_ceiling,
            sb_alt_min_rwy_length,
            sb_alt_avoid_bad_weather,
            sb_alt_exclude_airports,
            sb_takeoff_alt_code,
            sb_alt_1_code,
            sb_alt_2_code,
            sb_alt_3_code,
            sb_alt_4_code,
            passenger_lf_id,
            luggage_lf_id,
            cargo_weight_lf_id,
            cargo_volume_lf_id,
            container_ids,
            source_deleted,
            source_airport_id,
            source_airport_icao,
            source_airport_iata,
            source_created_at,
            source_updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
          )
          ON CONFLICT (icao_code) DO UPDATE SET
            iata_code = EXCLUDED.iata_code,
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            is_base = EXCLUDED.is_base,
            is_suitable_alternate = EXCLUDED.is_suitable_alternate,
            airport_briefing_url = EXCLUDED.airport_briefing_url,
            taxi_in_minutes = EXCLUDED.taxi_in_minutes,
            taxi_out_minutes = EXCLUDED.taxi_out_minutes,
            preferred_alternates = EXCLUDED.preferred_alternates,
            sb_alt_radius = EXCLUDED.sb_alt_radius,
            sb_alt_min_ceiling = EXCLUDED.sb_alt_min_ceiling,
            sb_alt_min_rwy_length = EXCLUDED.sb_alt_min_rwy_length,
            sb_alt_avoid_bad_weather = EXCLUDED.sb_alt_avoid_bad_weather,
            sb_alt_exclude_airports = EXCLUDED.sb_alt_exclude_airports,
            sb_takeoff_alt_code = EXCLUDED.sb_takeoff_alt_code,
            sb_alt_1_code = EXCLUDED.sb_alt_1_code,
            sb_alt_2_code = EXCLUDED.sb_alt_2_code,
            sb_alt_3_code = EXCLUDED.sb_alt_3_code,
            sb_alt_4_code = EXCLUDED.sb_alt_4_code,
            passenger_lf_id = EXCLUDED.passenger_lf_id,
            luggage_lf_id = EXCLUDED.luggage_lf_id,
            cargo_weight_lf_id = EXCLUDED.cargo_weight_lf_id,
            cargo_volume_lf_id = EXCLUDED.cargo_volume_lf_id,
            container_ids = EXCLUDED.container_ids,
            source_deleted = EXCLUDED.source_deleted,
            source_airport_id = EXCLUDED.source_airport_id,
            source_airport_icao = EXCLUDED.source_airport_icao,
            source_airport_iata = EXCLUDED.source_airport_iata,
            source_created_at = EXCLUDED.source_created_at,
            source_updated_at = EXCLUDED.source_updated_at
        `,
        [
          airport.icao_code,
          airport.iata_code,
          airport.name,
          airport.category,
          airport.is_base,
          airport.is_suitable_alternate,
          airport.airport_briefing_url,
          airport.taxi_in_minutes,
          airport.taxi_out_minutes,
          airport.preferred_alternates,
          airport.sb_alt_radius,
          airport.sb_alt_min_ceiling,
          airport.sb_alt_min_rwy_length,
          airport.sb_alt_avoid_bad_weather,
          airport.sb_alt_exclude_airports,
          airport.sb_takeoff_alt_code,
          airport.sb_alt_1_code,
          airport.sb_alt_2_code,
          airport.sb_alt_3_code,
          airport.sb_alt_4_code,
          airport.passenger_lf_id,
          airport.luggage_lf_id,
          airport.cargo_weight_lf_id,
          airport.cargo_volume_lf_id,
          airport.container_ids,
          airport.source_deleted,
          airport.source_airport_id,
          airport.source_airport_icao,
          airport.source_airport_iata,
          airport.source_created_at,
          airport.source_updated_at,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${airports.length} airport rows from ${csvPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
