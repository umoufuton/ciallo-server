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
    throw new Error("Usage: node scripts/import-fleets.mjs <csv-file-path>");
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

function mapRecord(record) {
  const sourceFleetId = parseInteger(record["ID"]);
  if (!sourceFleetId) return null;

  return {
    source_fleet_id: sourceFleetId,
    name: String(record["Name"] ?? "").trim(),
    type_code: String(record["Type Code"] ?? "").trim().toUpperCase(),
    type_category: String(record["Type (pax/cargo/...)"] ?? "").trim() || null,
    max_passengers: parseInteger(record["Max Passengers"]),
    max_freight: parseNumeric(record["Max Freight"]),
    container_units: parseInteger(record["Container Units"]),
    hide_in_phoenix: parseBoolean(record["Hide in Phoenix"]),
    pirep_scoring_group_id: parseInteger(record["PIREP Scoring Group ID"]),
    allowed_prefix_ids: String(record["Allowed Prefix IDs"] ?? "").trim() || null,
    sb_ofp_layout: String(record["SB OFP Layout"] ?? "").trim() || null,
    sb_perf_code: String(record["SB Perf Code"] ?? "").trim() || null,
    sb_weight_cat: String(record["SB Weight Cat"] ?? "").trim() || null,
    sb_etops_threshold: parseInteger(record["SB ETOPS Threshold"]),
    sb_etops_cert: String(record["SB ETOPS Cert"] ?? "").trim() || null,
    sb_icao_equip: String(record["SB ICAO Equip"] ?? "").trim() || null,
    sb_icao_transponder: String(record["SB ICAO Transponder"] ?? "").trim() || null,
    sb_pbn_capability: String(record["SB PBN Capability"] ?? "").trim() || null,
    sb_extra_fpl_info: String(record["SB Extra FPL Info"] ?? "").trim() || null,
    sb_engine_type: String(record["SB Engine Type"] ?? "").trim() || null,
    sb_pax_weight: parseNumeric(record["SB Pax Weight"]),
    sb_bag_weight: parseNumeric(record["SB Bag Weight"]),
    sb_oew: parseNumeric(record["SB OEW"]),
    sb_mzfw: parseNumeric(record["SB MZFW"]),
    sb_mtow: parseNumeric(record["SB MTOW"]),
    sb_mlw: parseNumeric(record["SB MLW"]),
    sb_max_fuel_cap: parseNumeric(record["SB Max Fuel Cap"]),
    sb_contingency_fuel: parseNumeric(record["SB Contingency Fuel"]),
    sb_reserve_fuel: parseNumeric(record["SB Reserve Fuel"]),
    sb_block_fuel: parseNumeric(record["SB Block Fuel"]),
    sb_block_fuel_units: String(record["SB Block Fuel Units"] ?? "").trim() || null,
    sb_arrival_fuel: parseNumeric(record["SB Arrival Fuel"]),
    sb_arrival_fuel_units: String(record["SB Arrival Fuel Units"] ?? "").trim() || null,
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
    sb_fuel_factor: parseNumeric(record["SB Fuel Factor"]),
    sb_service_ceiling: parseInteger(record["SB Service Ceiling"]),
    sb_cruise_profile: String(record["SB Cruise Profile"] ?? "").trim() || null,
    sb_cost_index: parseInteger(record["SB Cost Index"]),
    sb_climb_profile: String(record["SB Climb Profile"] ?? "").trim() || null,
    sb_descent_profile: String(record["SB Descent Profile"] ?? "").trim() || null,
    sb_altn_radius: parseInteger(record["SB Altn Radius"]),
    sb_altn_min_ceiling: parseInteger(record["SB Altn Min Ceiling"]),
    sb_altn_min_rwy_length: parseInteger(record["SB Altn Min Rwy Length"]),
    sb_altn_avoid_bad_wx: parseBoolean(record["SB Altn Avoid Bad Wx"]),
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

  const fleets = records.map(mapRecord).filter((record) => record && record.name && record.type_code);
  if (fleets.length === 0) {
    throw new Error("No valid fleet rows found in CSV");
  }

  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const fleet of fleets) {
      await client.query(
        `
          INSERT INTO fleets (
            source_fleet_id, name, type_code, type_category, max_passengers, max_freight,
            container_units, hide_in_phoenix, pirep_scoring_group_id, allowed_prefix_ids,
            sb_ofp_layout, sb_perf_code, sb_weight_cat, sb_etops_threshold, sb_etops_cert,
            sb_icao_equip, sb_icao_transponder, sb_pbn_capability, sb_extra_fpl_info,
            sb_engine_type, sb_pax_weight, sb_bag_weight, sb_oew, sb_mzfw, sb_mtow,
            sb_mlw, sb_max_fuel_cap, sb_contingency_fuel, sb_reserve_fuel, sb_block_fuel,
            sb_block_fuel_units, sb_arrival_fuel, sb_arrival_fuel_units, sb_mel_fuel,
            sb_mel_fuel_units, sb_atc_fuel, sb_atc_fuel_units, sb_wxx_fuel, sb_wxx_fuel_units,
            sb_extra_fuel, sb_extra_fuel_units, sb_tankering_fuel, sb_tankering_fuel_units,
            sb_fuel_factor, sb_service_ceiling, sb_cruise_profile, sb_cost_index,
            sb_climb_profile, sb_descent_profile, sb_altn_radius, sb_altn_min_ceiling,
            sb_altn_min_rwy_length, sb_altn_avoid_bad_wx, source_deleted
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25,
            $26, $27, $28, $29, $30,
            $31, $32, $33, $34,
            $35, $36, $37, $38, $39,
            $40, $41, $42, $43,
            $44, $45, $46, $47,
            $48, $49, $50, $51,
            $52, $53, $54
          )
          ON CONFLICT (source_fleet_id) DO UPDATE SET
            name = EXCLUDED.name,
            type_code = EXCLUDED.type_code,
            type_category = EXCLUDED.type_category,
            max_passengers = EXCLUDED.max_passengers,
            max_freight = EXCLUDED.max_freight,
            container_units = EXCLUDED.container_units,
            hide_in_phoenix = EXCLUDED.hide_in_phoenix,
            pirep_scoring_group_id = EXCLUDED.pirep_scoring_group_id,
            allowed_prefix_ids = EXCLUDED.allowed_prefix_ids,
            sb_ofp_layout = EXCLUDED.sb_ofp_layout,
            sb_perf_code = EXCLUDED.sb_perf_code,
            sb_weight_cat = EXCLUDED.sb_weight_cat,
            sb_etops_threshold = EXCLUDED.sb_etops_threshold,
            sb_etops_cert = EXCLUDED.sb_etops_cert,
            sb_icao_equip = EXCLUDED.sb_icao_equip,
            sb_icao_transponder = EXCLUDED.sb_icao_transponder,
            sb_pbn_capability = EXCLUDED.sb_pbn_capability,
            sb_extra_fpl_info = EXCLUDED.sb_extra_fpl_info,
            sb_engine_type = EXCLUDED.sb_engine_type,
            sb_pax_weight = EXCLUDED.sb_pax_weight,
            sb_bag_weight = EXCLUDED.sb_bag_weight,
            sb_oew = EXCLUDED.sb_oew,
            sb_mzfw = EXCLUDED.sb_mzfw,
            sb_mtow = EXCLUDED.sb_mtow,
            sb_mlw = EXCLUDED.sb_mlw,
            sb_max_fuel_cap = EXCLUDED.sb_max_fuel_cap,
            sb_contingency_fuel = EXCLUDED.sb_contingency_fuel,
            sb_reserve_fuel = EXCLUDED.sb_reserve_fuel,
            sb_block_fuel = EXCLUDED.sb_block_fuel,
            sb_block_fuel_units = EXCLUDED.sb_block_fuel_units,
            sb_arrival_fuel = EXCLUDED.sb_arrival_fuel,
            sb_arrival_fuel_units = EXCLUDED.sb_arrival_fuel_units,
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
            sb_fuel_factor = EXCLUDED.sb_fuel_factor,
            sb_service_ceiling = EXCLUDED.sb_service_ceiling,
            sb_cruise_profile = EXCLUDED.sb_cruise_profile,
            sb_cost_index = EXCLUDED.sb_cost_index,
            sb_climb_profile = EXCLUDED.sb_climb_profile,
            sb_descent_profile = EXCLUDED.sb_descent_profile,
            sb_altn_radius = EXCLUDED.sb_altn_radius,
            sb_altn_min_ceiling = EXCLUDED.sb_altn_min_ceiling,
            sb_altn_min_rwy_length = EXCLUDED.sb_altn_min_rwy_length,
            sb_altn_avoid_bad_wx = EXCLUDED.sb_altn_avoid_bad_wx,
            source_deleted = EXCLUDED.source_deleted
        `,
        [
          fleet.source_fleet_id, fleet.name, fleet.type_code, fleet.type_category, fleet.max_passengers, fleet.max_freight,
          fleet.container_units, fleet.hide_in_phoenix, fleet.pirep_scoring_group_id, fleet.allowed_prefix_ids,
          fleet.sb_ofp_layout, fleet.sb_perf_code, fleet.sb_weight_cat, fleet.sb_etops_threshold, fleet.sb_etops_cert,
          fleet.sb_icao_equip, fleet.sb_icao_transponder, fleet.sb_pbn_capability, fleet.sb_extra_fpl_info,
          fleet.sb_engine_type, fleet.sb_pax_weight, fleet.sb_bag_weight, fleet.sb_oew, fleet.sb_mzfw, fleet.sb_mtow,
          fleet.sb_mlw, fleet.sb_max_fuel_cap, fleet.sb_contingency_fuel, fleet.sb_reserve_fuel, fleet.sb_block_fuel,
          fleet.sb_block_fuel_units, fleet.sb_arrival_fuel, fleet.sb_arrival_fuel_units, fleet.sb_mel_fuel,
          fleet.sb_mel_fuel_units, fleet.sb_atc_fuel, fleet.sb_atc_fuel_units, fleet.sb_wxx_fuel, fleet.sb_wxx_fuel_units,
          fleet.sb_extra_fuel, fleet.sb_extra_fuel_units, fleet.sb_tankering_fuel, fleet.sb_tankering_fuel_units,
          fleet.sb_fuel_factor, fleet.sb_service_ceiling, fleet.sb_cruise_profile, fleet.sb_cost_index,
          fleet.sb_climb_profile, fleet.sb_descent_profile, fleet.sb_altn_radius, fleet.sb_altn_min_ceiling,
          fleet.sb_altn_min_rwy_length, fleet.sb_altn_avoid_bad_wx, fleet.source_deleted,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${fleets.length} fleet rows from ${csvPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
