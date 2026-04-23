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
    throw new Error("Usage: node scripts/import-routes.mjs <csv-file-path>");
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

function parseNumeric(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const normalized = String(value).trim().replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTimestamp(value) {
  if (!value || String(value).trim() === "") return null;
  const [datePart, timePart = "00:00"] = String(value).trim().split(" ");
  const [day, month, year] = datePart.split("/");
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${timePart}:00`;
}

function parseIntArray(value) {
  if (!value || String(value).trim() === "") return null;
  const items = String(value)
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => !Number.isNaN(item));
  return items.length > 0 ? items : null;
}

function parseTextArray(value) {
  if (!value || String(value).trim() === "") return null;
  const items = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

function mapRecord(record) {
  const sourceRouteId = parseInteger(record["ID"]);
  if (!sourceRouteId) return null;

  return {
    source_route_id: sourceRouteId,
    departure_airport_code: String(record["Departure Airport (ICAO/IATA)"] ?? "").trim().toUpperCase(),
    arrival_airport_code: String(record["Arrival Airport (ICAO/IATA)"] ?? "").trim().toUpperCase(),
    route_type: String(record["Type"] ?? "").trim() || null,
    start_date: parseTimestamp(record["Start Date"]),
    end_date: parseTimestamp(record["End Date"]),
    departure_time: String(record["Departure Time (HH:MM)"] ?? "").trim() || null,
    arrival_time: String(record["Arrival Time (HH:MM)"] ?? "").trim() || null,
    callsign: String(record["Callsign"] ?? "").trim() || null,
    flight_number: String(record["Flight Number"] ?? "").trim() || null,
    altitude: String(record["Altitude"] ?? "").trim() || null,
    cost_index: parseInteger(record["Cost Index"]),
    flight_length: String(record["Flight Length (HH:MM)"] ?? "").trim() || null,
    flight_distance_nm: parseInteger(record["Flight Distance (NM)"]),
    service_days: String(record["Service Days"] ?? "").trim() || null,
    routing: String(record["Routing"] ?? "").trim() || null,
    remarks: String(record["Remarks"] ?? "").trim() || null,
    internal_remarks: String(record["Internal Remarks"] ?? "").trim() || null,
    tags: parseTextArray(record["Tags"]),
    is_hidden: parseBoolean(record["Is Hidden"]),
    flight_rules: String(record["Flight Rules"] ?? "").trim() || null,
    flight_type: String(record["Flight Type"] ?? "").trim() || null,
    allow_callsign_change: parseBoolean(record["Allow Callsign Change"]),
    cs_defaults_username_opt1: parseBoolean(record["CS Defaults Username Opt1"]),
    cs_defaults_username_opt2: parseBoolean(record["CS Defaults Username Opt2"]),
    cs_defaults_aircraft_reg: parseBoolean(record["CS Defaults Aircraft Reg"]),
    callsign_generator_str: String(record["Callsign Generator Str"] ?? "").trim() || null,
    pax_lf_id: parseInteger(record["Pax LF ID"]),
    pax_luggage_lf_id: parseInteger(record["Pax Luggage LF ID"]),
    cargo_lf_id: parseInteger(record["Cargo LF ID"]),
    cargo_volume_lf_id: parseInteger(record["Cargo Volume LF ID"]),
    container_ids: parseIntArray(record["Container IDs"]),
    fleet_source_ids: parseIntArray(record["Fleet IDs"]),
    sb_mel_fuel: parseNumeric(record["SB MEL Fuel"]),
    sb_mel_fuel_units: String(record["SB MEL Fuel Units"] ?? "").trim() || null,
    sb_atc_fuel: parseNumeric(record["SB ATC Fuel"]),
    sb_atc_fuel_units: String(record["SB ATC Fuel Units"] ?? "").trim() || null,
    sb_wxx_fuel: parseNumeric(record["SB WXX Fuel"]),
    sb_wxx_fuel_units: String(record["SB WXX Fuel Units"] ?? "").trim() || null,
    sb_extra_fuel: parseNumeric(record["SB Extra Fuel"]),
    sb_extra_fuel_units: String(record["SB Extra Fuel Units"] ?? "").trim() || null,
    sb_tankering_fuel: parseNumeric(record["SB Tankering Fuel"]),
    sb_tankering_fuel_units: String(record["SB Tankering Fuel Units"] ?? "").trim() || null,
    sb_min_fob: parseNumeric(record["SB Min FOB"]),
    sb_min_fob_units: String(record["SB Min FOB Units"] ?? "").trim() || null,
    sb_min_fod: parseNumeric(record["SB Min FOD"]),
    sb_min_fod_units: String(record["SB Min FOD Units"] ?? "").trim() || null,
    sb_pax_wgt: parseNumeric(record["SB Pax Wgt"]),
    sb_bag_wgt: parseNumeric(record["SB Bag Wgt"]),
    sb_enroute_altn: String(record["SB Enroute Altn"] ?? "").trim() || null,
    sb_takeoff_altn: String(record["SB Takeoff Altn"] ?? "").trim() || null,
    sb_altn_1: String(record["SB Altn 1"] ?? "").trim() || null,
    sb_altn_2: String(record["SB Altn 2"] ?? "").trim() || null,
    sb_altn_3: String(record["SB Altn 3"] ?? "").trim() || null,
    sb_altn_4: String(record["SB Altn 4"] ?? "").trim() || null,
    sb_contingency_fuel: parseNumeric(record["SB Contingency Fuel"]),
    sb_reserve_fuel: parseNumeric(record["SB Reserve Fuel"]),
    source_deleted: parseBoolean(record["_delete"]),
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

  const routes = records
    .map(mapRecord)
    .filter((record) => record && record.departure_airport_code && record.arrival_airport_code);

  if (routes.length === 0) {
    throw new Error("No valid route rows found in CSV");
  }

  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const route of routes) {
      await client.query(
        `
          INSERT INTO scheduled_routes (
            source_route_id, departure_airport_code, arrival_airport_code, route_type,
            start_date, end_date, departure_time, arrival_time, callsign, flight_number,
            altitude, cost_index, flight_length, flight_distance_nm, service_days, routing,
            remarks, internal_remarks, tags, is_hidden, flight_rules, flight_type,
            allow_callsign_change, cs_defaults_username_opt1, cs_defaults_username_opt2,
            cs_defaults_aircraft_reg, callsign_generator_str, pax_lf_id, pax_luggage_lf_id,
            cargo_lf_id, cargo_volume_lf_id, container_ids, fleet_source_ids, sb_mel_fuel,
            sb_mel_fuel_units, sb_atc_fuel, sb_atc_fuel_units, sb_wxx_fuel, sb_wxx_fuel_units,
            sb_extra_fuel, sb_extra_fuel_units, sb_tankering_fuel, sb_tankering_fuel_units,
            sb_min_fob, sb_min_fob_units, sb_min_fod, sb_min_fod_units, sb_pax_wgt, sb_bag_wgt,
            sb_enroute_altn, sb_takeoff_altn, sb_altn_1, sb_altn_2, sb_altn_3, sb_altn_4,
            sb_contingency_fuel, sb_reserve_fuel, source_deleted
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22,
            $23, $24, $25,
            $26, $27, $28, $29,
            $30, $31, $32, $33, $34,
            $35, $36, $37, $38, $39,
            $40, $41, $42, $43,
            $44, $45, $46, $47, $48, $49,
            $50, $51, $52, $53, $54, $55,
            $56, $57, $58
          )
          ON CONFLICT (source_route_id) DO UPDATE SET
            departure_airport_code = EXCLUDED.departure_airport_code,
            arrival_airport_code = EXCLUDED.arrival_airport_code,
            route_type = EXCLUDED.route_type,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            departure_time = EXCLUDED.departure_time,
            arrival_time = EXCLUDED.arrival_time,
            callsign = EXCLUDED.callsign,
            flight_number = EXCLUDED.flight_number,
            altitude = EXCLUDED.altitude,
            cost_index = EXCLUDED.cost_index,
            flight_length = EXCLUDED.flight_length,
            flight_distance_nm = EXCLUDED.flight_distance_nm,
            service_days = EXCLUDED.service_days,
            routing = EXCLUDED.routing,
            remarks = EXCLUDED.remarks,
            internal_remarks = EXCLUDED.internal_remarks,
            tags = EXCLUDED.tags,
            is_hidden = EXCLUDED.is_hidden,
            flight_rules = EXCLUDED.flight_rules,
            flight_type = EXCLUDED.flight_type,
            allow_callsign_change = EXCLUDED.allow_callsign_change,
            cs_defaults_username_opt1 = EXCLUDED.cs_defaults_username_opt1,
            cs_defaults_username_opt2 = EXCLUDED.cs_defaults_username_opt2,
            cs_defaults_aircraft_reg = EXCLUDED.cs_defaults_aircraft_reg,
            callsign_generator_str = EXCLUDED.callsign_generator_str,
            pax_lf_id = EXCLUDED.pax_lf_id,
            pax_luggage_lf_id = EXCLUDED.pax_luggage_lf_id,
            cargo_lf_id = EXCLUDED.cargo_lf_id,
            cargo_volume_lf_id = EXCLUDED.cargo_volume_lf_id,
            container_ids = EXCLUDED.container_ids,
            fleet_source_ids = EXCLUDED.fleet_source_ids,
            sb_mel_fuel = EXCLUDED.sb_mel_fuel,
            sb_mel_fuel_units = EXCLUDED.sb_mel_fuel_units,
            sb_atc_fuel = EXCLUDED.sb_atc_fuel,
            sb_atc_fuel_units = EXCLUDED.sb_atc_fuel_units,
            sb_wxx_fuel = EXCLUDED.sb_wxx_fuel,
            sb_wxx_fuel_units = EXCLUDED.sb_wxx_fuel_units,
            sb_extra_fuel = EXCLUDED.sb_extra_fuel,
            sb_extra_fuel_units = EXCLUDED.sb_extra_fuel_units,
            sb_tankering_fuel = EXCLUDED.sb_tankering_fuel,
            sb_tankering_fuel_units = EXCLUDED.sb_tankering_fuel_units,
            sb_min_fob = EXCLUDED.sb_min_fob,
            sb_min_fob_units = EXCLUDED.sb_min_fob_units,
            sb_min_fod = EXCLUDED.sb_min_fod,
            sb_min_fod_units = EXCLUDED.sb_min_fod_units,
            sb_pax_wgt = EXCLUDED.sb_pax_wgt,
            sb_bag_wgt = EXCLUDED.sb_bag_wgt,
            sb_enroute_altn = EXCLUDED.sb_enroute_altn,
            sb_takeoff_altn = EXCLUDED.sb_takeoff_altn,
            sb_altn_1 = EXCLUDED.sb_altn_1,
            sb_altn_2 = EXCLUDED.sb_altn_2,
            sb_altn_3 = EXCLUDED.sb_altn_3,
            sb_altn_4 = EXCLUDED.sb_altn_4,
            sb_contingency_fuel = EXCLUDED.sb_contingency_fuel,
            sb_reserve_fuel = EXCLUDED.sb_reserve_fuel,
            source_deleted = EXCLUDED.source_deleted
        `,
        [
          route.source_route_id, route.departure_airport_code, route.arrival_airport_code, route.route_type,
          route.start_date, route.end_date, route.departure_time, route.arrival_time, route.callsign, route.flight_number,
          route.altitude, route.cost_index, route.flight_length, route.flight_distance_nm, route.service_days, route.routing,
          route.remarks, route.internal_remarks, route.tags, route.is_hidden, route.flight_rules, route.flight_type,
          route.allow_callsign_change, route.cs_defaults_username_opt1, route.cs_defaults_username_opt2,
          route.cs_defaults_aircraft_reg, route.callsign_generator_str, route.pax_lf_id, route.pax_luggage_lf_id,
          route.cargo_lf_id, route.cargo_volume_lf_id, route.container_ids, route.fleet_source_ids, route.sb_mel_fuel,
          route.sb_mel_fuel_units, route.sb_atc_fuel, route.sb_atc_fuel_units, route.sb_wxx_fuel, route.sb_wxx_fuel_units,
          route.sb_extra_fuel, route.sb_extra_fuel_units, route.sb_tankering_fuel, route.sb_tankering_fuel_units,
          route.sb_min_fob, route.sb_min_fob_units, route.sb_min_fod, route.sb_min_fod_units, route.sb_pax_wgt, route.sb_bag_wgt,
          route.sb_enroute_altn, route.sb_takeoff_altn, route.sb_altn_1, route.sb_altn_2, route.sb_altn_3, route.sb_altn_4,
          route.sb_contingency_fuel, route.sb_reserve_fuel, route.source_deleted,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${routes.length} route rows from ${csvPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
