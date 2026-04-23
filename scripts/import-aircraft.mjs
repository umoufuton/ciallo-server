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
    throw new Error("Usage: node scripts/import-aircraft.mjs <csv-file-path>");
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
  const sourceAircraftId = parseInteger(record["ID"]);
  if (!sourceAircraftId) return null;

  return {
    source_aircraft_id: sourceAircraftId,
    name: String(record["Name"] ?? "").trim(),
    registration: String(record["Registration"] ?? "").trim().toUpperCase(),
    selcal: String(record["SELCAL"] ?? "").trim().toUpperCase() || null,
    fin_number: String(record["Fin Number"] ?? "").trim() || null,
    hex_code: String(record["Hex Code"] ?? "").trim().toUpperCase() || null,
    source_fleet_id: parseInteger(record["Fleet ID"]),
    passengers: parseInteger(record["Passengers"]),
    freight: parseNumeric(record["Freight"]),
    container_units: parseInteger(record["Container Units"]),
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
    internal_remarks: String(record["Internal Remarks"] ?? "").trim() || null,
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

  const aircraftRows = records.map(mapRecord).filter((record) => record && record.name && record.registration);
  if (aircraftRows.length === 0) {
    throw new Error("No valid aircraft rows found in CSV");
  }

  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const aircraft of aircraftRows) {
      const fleetResult = aircraft.source_fleet_id
        ? await client.query("SELECT id FROM fleets WHERE source_fleet_id = $1 LIMIT 1", [aircraft.source_fleet_id])
        : { rows: [] };

      const fleetId = fleetResult.rows[0]?.id ?? null;
      const existingAircraft = await client.query(
        `
          SELECT id
          FROM aircraft
          WHERE source_aircraft_id = $1 OR UPPER(registration) = $2
          LIMIT 1
        `,
        [aircraft.source_aircraft_id, aircraft.registration],
      );

      const values = [
        aircraft.source_aircraft_id, aircraft.name, aircraft.registration, aircraft.selcal, aircraft.fin_number, aircraft.hex_code,
        fleetId, aircraft.source_fleet_id, aircraft.passengers, aircraft.freight, aircraft.container_units,
        aircraft.sb_ofp_layout, aircraft.sb_perf_code, aircraft.sb_weight_cat, aircraft.sb_etops_threshold, aircraft.sb_etops_cert,
        aircraft.sb_icao_equip, aircraft.sb_icao_transponder, aircraft.sb_pbn_capability, aircraft.sb_extra_fpl_info,
        aircraft.sb_engine_type, aircraft.sb_pax_weight, aircraft.sb_bag_weight, aircraft.sb_oew, aircraft.sb_mzfw, aircraft.sb_mtow,
        aircraft.sb_mlw, aircraft.sb_max_fuel_cap, aircraft.sb_contingency_fuel, aircraft.sb_reserve_fuel, aircraft.sb_block_fuel,
        aircraft.sb_block_fuel_units, aircraft.sb_arrival_fuel, aircraft.sb_arrival_fuel_units, aircraft.sb_mel_fuel,
        aircraft.sb_mel_fuel_units, aircraft.sb_atc_fuel, aircraft.sb_atc_fuel_units, aircraft.sb_wxx_fuel, aircraft.sb_wxx_fuel_units,
        aircraft.sb_extra_fuel, aircraft.sb_extra_fuel_units, aircraft.sb_tankering_fuel, aircraft.sb_tankering_fuel_units,
        aircraft.sb_fuel_factor, aircraft.sb_service_ceiling, aircraft.sb_cruise_profile, aircraft.sb_cost_index,
        aircraft.sb_climb_profile, aircraft.sb_descent_profile, aircraft.internal_remarks, aircraft.source_deleted,
      ];

      if (existingAircraft.rows[0]?.id) {
        await client.query(
          `
            UPDATE aircraft
            SET
              source_aircraft_id = $1,
              name = $2,
              registration = $3,
              selcal = $4,
              fin_number = $5,
              hex_code = $6,
              fleet_id = $7,
              source_fleet_id = $8,
              passengers = $9,
              freight = $10,
              container_units = $11,
              sb_ofp_layout = $12,
              sb_perf_code = $13,
              sb_weight_cat = $14,
              sb_etops_threshold = $15,
              sb_etops_cert = $16,
              sb_icao_equip = $17,
              sb_icao_transponder = $18,
              sb_pbn_capability = $19,
              sb_extra_fpl_info = $20,
              sb_engine_type = $21,
              sb_pax_weight = $22,
              sb_bag_weight = $23,
              sb_oew = $24,
              sb_mzfw = $25,
              sb_mtow = $26,
              sb_mlw = $27,
              sb_max_fuel_cap = $28,
              sb_contingency_fuel = $29,
              sb_reserve_fuel = $30,
              sb_block_fuel = $31,
              sb_block_fuel_units = $32,
              sb_arrival_fuel = $33,
              sb_arrival_fuel_units = $34,
              sb_mel_fuel = $35,
              sb_mel_fuel_units = $36,
              sb_atc_fuel = $37,
              sb_atc_fuel_units = $38,
              sb_wxx_fuel = $39,
              sb_wxx_fuel_units = $40,
              sb_extra_fuel = $41,
              sb_extra_fuel_units = $42,
              sb_tankering_fuel = $43,
              sb_tankering_fuel_units = $44,
              sb_fuel_factor = $45,
              sb_service_ceiling = $46,
              sb_cruise_profile = $47,
              sb_cost_index = $48,
              sb_climb_profile = $49,
              sb_descent_profile = $50,
              internal_remarks = $51,
              source_deleted = $52
            WHERE id = $53
          `,
          [...values, existingAircraft.rows[0].id],
        );
      } else {
        await client.query(
          `
            INSERT INTO aircraft (
              source_aircraft_id, name, registration, selcal, fin_number, hex_code,
              fleet_id, source_fleet_id, passengers, freight, container_units,
              sb_ofp_layout, sb_perf_code, sb_weight_cat, sb_etops_threshold, sb_etops_cert,
              sb_icao_equip, sb_icao_transponder, sb_pbn_capability, sb_extra_fpl_info,
              sb_engine_type, sb_pax_weight, sb_bag_weight, sb_oew, sb_mzfw, sb_mtow,
              sb_mlw, sb_max_fuel_cap, sb_contingency_fuel, sb_reserve_fuel, sb_block_fuel,
              sb_block_fuel_units, sb_arrival_fuel, sb_arrival_fuel_units, sb_mel_fuel,
              sb_mel_fuel_units, sb_atc_fuel, sb_atc_fuel_units, sb_wxx_fuel, sb_wxx_fuel_units,
              sb_extra_fuel, sb_extra_fuel_units, sb_tankering_fuel, sb_tankering_fuel_units,
              sb_fuel_factor, sb_service_ceiling, sb_cruise_profile, sb_cost_index,
              sb_climb_profile, sb_descent_profile, internal_remarks, source_deleted
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16,
              $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26,
              $27, $28, $29, $30, $31,
              $32, $33, $34, $35,
              $36, $37, $38, $39, $40,
              $41, $42, $43, $44,
              $45, $46, $47, $48,
              $49, $50, $51, $52
            )
          `,
          values,
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Imported ${aircraftRows.length} aircraft rows from ${csvPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
