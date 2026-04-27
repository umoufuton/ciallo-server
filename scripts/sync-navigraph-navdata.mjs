import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    file: null,
    cycle: null,
    packageStatus: process.env.NAVIGRAPH_PACKAGE_STATUS || "current",
    format: process.env.NAVIGRAPH_NAVDATA_FORMAT || "",
    force: false,
    activate: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--file") args.file = argv[++i];
    else if (item === "--cycle") args.cycle = argv[++i];
    else if (item === "--package-status") args.packageStatus = argv[++i];
    else if (item === "--format") args.format = argv[++i];
    else if (item === "--force") args.force = true;
    else if (item === "--no-activate") args.activate = false;
  }

  return args;
}

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  return process.env.DATABASE_URL;
}

function readEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function sqliteJson(sqlitePath, sql) {
  const { stdout } = await runCommand("sqlite3", ["-json", sqlitePath, sql]);
  const text = stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
}

async function sqliteScalar(sqlitePath, sql, key = "value") {
  const rows = await sqliteJson(sqlitePath, sql);
  return rows[0]?.[key] ?? null;
}

async function getNavigraphAccessToken() {
  const explicitToken = readEnv("NAVIGRAPH_ACCESS_TOKEN");
  if (explicitToken) return explicitToken;

  const clientId = readEnv("NAVIGRAPH_CLIENT_ID");
  const clientSecret = readEnv("NAVIGRAPH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("NAVIGRAPH_ACCESS_TOKEN or NAVIGRAPH_CLIENT_ID/NAVIGRAPH_CLIENT_SECRET is required");
  }

  const tokenUrl = readEnv("NAVIGRAPH_TOKEN_URL") || "https://identity.api.navigraph.com/connect/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: readEnv("NAVIGRAPH_SCOPE") || "fmsdata",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Navigraph token request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Navigraph token response did not include access_token");
  }
  return payload.access_token;
}

async function getNavigraphPackage(args) {
  const token = await getNavigraphAccessToken();
  const packagesUrl = new URL(readEnv("NAVIGRAPH_PACKAGES_URL") || "https://api.navigraph.com/v1/navdata/packages");
  if (args.packageStatus) packagesUrl.searchParams.set("package_status", args.packageStatus);
  if (args.format) packagesUrl.searchParams.set("format", args.format);

  const response = await fetch(packagesUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Navigraph packages request failed: ${response.status} ${await response.text()}`);
  }

  const packages = await response.json();
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error("Navigraph packages response is empty");
  }

  const preferred = packages.find((pkg) =>
    Array.isArray(pkg.files) &&
    pkg.files.some((file) => typeof file.signed_url === "string" && /\.(zip|3sdb|sqlite|db)(\?|$)/i.test(file.key ?? file.signed_url)),
  );
  const selected = preferred ?? packages[0];
  const file = selected.files?.find((candidate) => typeof candidate.signed_url === "string");
  if (!file) {
    throw new Error("Selected Navigraph package does not include a downloadable file");
  }

  return { package: selected, file };
}

async function downloadFile(url, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function findFirstSqliteFile(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstSqliteFile(fullPath);
      if (nested) return nested;
    } else if (/\.(3sdb|sqlite|db)$/i.test(entry.name)) {
      return fullPath;
    }
  }
  return null;
}

async function prepareSqliteFile(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!/\.zip$/i.test(resolved)) return resolved;

  const extractDir = path.join(appRoot, "data", "navdata", "extract", `${Date.now()}`);
  await fs.mkdir(extractDir, { recursive: true });
  await runCommand("unzip", ["-q", resolved, "-d", extractDir]);

  const sqlitePath = await findFirstSqliteFile(extractDir);
  if (!sqlitePath) {
    throw new Error(`No .3sdb/.sqlite/.db file found in ${resolved}`);
  }
  return sqlitePath;
}

async function resolveSource(args) {
  const localFile = args.file || readEnv("NAVIGRAPH_NAVDATA_FILE");
  if (localFile) {
    const sqlitePath = await prepareSqliteFile(localFile);
    return {
      sqlitePath,
      packageInfo: null,
      fileInfo: null,
      fileHash: null,
    };
  }

  const { package: packageInfo, file } = await getNavigraphPackage(args);
  const safeCycle = packageInfo.cycle || "unknown";
  const safeName = path.basename(file.key || "navdata.zip").replace(/[^\w.-]+/g, "_");
  const downloadPath = path.join(appRoot, "data", "navdata", "packages", `${safeCycle}-${safeName}`);
  const fileHash = await downloadFile(file.signed_url, downloadPath);
  const sqlitePath = await prepareSqliteFile(downloadPath);

  return {
    sqlitePath,
    packageInfo,
    fileInfo: file,
    fileHash,
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInteger(value) {
  const numeric = toNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeIdent(value) {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

async function importWaypoints(client, sqlitePath, cycle, batchSize) {
  const total = Number(await sqliteScalar(sqlitePath, "SELECT COUNT(*) AS value FROM tbl_ea_enroute_waypoints"));
  let inserted = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const rows = await sqliteJson(
      sqlitePath,
      `
        SELECT
          area_code,
          continent,
          country,
          datum_code,
          icao_code,
          waypoint_identifier,
          waypoint_latitude,
          waypoint_longitude,
          waypoint_name,
          waypoint_type,
          waypoint_usage
        FROM tbl_ea_enroute_waypoints
        LIMIT ${batchSize} OFFSET ${offset}
      `,
    );

    const batch = rows
      .map((row) => ({
        ident: normalizeIdent(row.waypoint_identifier),
        area_code: normalizeText(row.area_code),
        continent: normalizeText(row.continent),
        country: normalizeText(row.country),
        datum_code: normalizeText(row.datum_code),
        icao_code: normalizeText(row.icao_code),
        latitude: toNumber(row.waypoint_latitude),
        longitude: toNumber(row.waypoint_longitude),
        name: normalizeText(row.waypoint_name),
        waypoint_type: normalizeText(row.waypoint_type),
        waypoint_usage: normalizeText(row.waypoint_usage),
      }))
      .filter((row) => row.ident && row.latitude !== null && row.longitude !== null);

    if (batch.length === 0) continue;

    const result = await client.query(
      `
        INSERT INTO nav_waypoints (
          cycle, ident, area_code, continent, country, datum_code, icao_code,
          latitude, longitude, name, waypoint_type, waypoint_usage
        )
        SELECT
          $1,
          x.ident,
          x.area_code,
          x.continent,
          x.country,
          x.datum_code,
          x.icao_code,
          x.latitude,
          x.longitude,
          x.name,
          x.waypoint_type,
          x.waypoint_usage
        FROM jsonb_to_recordset($2::jsonb) AS x(
          ident text,
          area_code text,
          continent text,
          country text,
          datum_code text,
          icao_code text,
          latitude numeric,
          longitude numeric,
          name text,
          waypoint_type text,
          waypoint_usage text
        )
      `,
      [cycle, JSON.stringify(batch)],
    );
    inserted += result.rowCount ?? batch.length;
    console.log(`Imported waypoints ${Math.min(offset + batchSize, total)}/${total}`);
  }

  return inserted;
}

async function importAirways(client, sqlitePath, cycle, batchSize) {
  const total = Number(await sqliteScalar(sqlitePath, "SELECT COUNT(*) AS value FROM tbl_er_enroute_airways"));
  let inserted = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const rows = await sqliteJson(
      sqlitePath,
      `
        SELECT
          area_code,
          crusing_table_identifier,
          direction_restriction,
          flightlevel,
          icao_code,
          inbound_course,
          inbound_distance,
          maximum_altitude,
          minimum_altitude1,
          minimum_altitude2,
          outbound_course,
          route_identifier_postfix,
          route_identifier,
          route_type,
          seqno,
          waypoint_description_code,
          waypoint_identifier,
          waypoint_latitude,
          waypoint_longitude,
          waypoint_ref_table
        FROM tbl_er_enroute_airways
        LIMIT ${batchSize} OFFSET ${offset}
      `,
    );

    const batch = rows
      .map((row) => ({
        route_identifier: normalizeIdent(row.route_identifier),
        route_identifier_postfix: normalizeText(row.route_identifier_postfix),
        route_type: normalizeText(row.route_type),
        seqno: toInteger(row.seqno),
        area_code: normalizeText(row.area_code),
        icao_code: normalizeText(row.icao_code),
        waypoint_identifier: normalizeIdent(row.waypoint_identifier),
        waypoint_ref_table: normalizeText(row.waypoint_ref_table),
        waypoint_description_code: normalizeText(row.waypoint_description_code),
        latitude: toNumber(row.waypoint_latitude),
        longitude: toNumber(row.waypoint_longitude),
        direction_restriction: normalizeText(row.direction_restriction),
        flightlevel: normalizeText(row.flightlevel),
        inbound_course: toNumber(row.inbound_course),
        inbound_distance: toNumber(row.inbound_distance),
        outbound_course: toNumber(row.outbound_course),
        minimum_altitude1: toInteger(row.minimum_altitude1),
        minimum_altitude2: toInteger(row.minimum_altitude2),
        maximum_altitude: toInteger(row.maximum_altitude),
      }))
      .filter(
        (row) =>
          row.route_identifier &&
          row.waypoint_identifier &&
          row.seqno !== null &&
          row.latitude !== null &&
          row.longitude !== null,
      );

    if (batch.length === 0) continue;

    const result = await client.query(
      `
        INSERT INTO nav_airway_points (
          cycle, route_identifier, route_identifier_postfix, route_type, seqno,
          area_code, icao_code, waypoint_identifier, waypoint_ref_table,
          waypoint_description_code, latitude, longitude, direction_restriction,
          flightlevel, inbound_course, inbound_distance, outbound_course,
          minimum_altitude1, minimum_altitude2, maximum_altitude
        )
        SELECT
          $1,
          x.route_identifier,
          x.route_identifier_postfix,
          x.route_type,
          x.seqno,
          x.area_code,
          x.icao_code,
          x.waypoint_identifier,
          x.waypoint_ref_table,
          x.waypoint_description_code,
          x.latitude,
          x.longitude,
          x.direction_restriction,
          x.flightlevel,
          x.inbound_course,
          x.inbound_distance,
          x.outbound_course,
          x.minimum_altitude1,
          x.minimum_altitude2,
          x.maximum_altitude
        FROM jsonb_to_recordset($2::jsonb) AS x(
          route_identifier text,
          route_identifier_postfix text,
          route_type text,
          seqno integer,
          area_code text,
          icao_code text,
          waypoint_identifier text,
          waypoint_ref_table text,
          waypoint_description_code text,
          latitude numeric,
          longitude numeric,
          direction_restriction text,
          flightlevel text,
          inbound_course numeric,
          inbound_distance numeric,
          outbound_course numeric,
          minimum_altitude1 integer,
          minimum_altitude2 integer,
          maximum_altitude integer
        )
      `,
      [cycle, JSON.stringify(batch)],
    );
    inserted += result.rowCount ?? batch.length;
    console.log(`Imported airway points ${Math.min(offset + batchSize, total)}/${total}`);
  }

  return inserted;
}

async function shouldSkipImport(client, cycle, revision, sourceFileHash, force) {
  if (force) return false;
  const result = await client.query(
    `
      SELECT waypoint_count, airway_point_count, revision, source_file_hash
      FROM nav_airac_cycles
      WHERE cycle = $1
      LIMIT 1
    `,
    [cycle],
  );

  const existing = result.rows[0];
  if (!existing) return false;
  if (Number(existing.waypoint_count) <= 0 || Number(existing.airway_point_count) <= 0) return false;
  if (sourceFileHash && existing.source_file_hash && sourceFileHash !== existing.source_file_hash) return false;
  if (revision && existing.revision && revision !== existing.revision) return false;
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchSize = Number.parseInt(process.env.NAVIGRAPH_IMPORT_BATCH_SIZE || "5000", 10);
  const source = await resolveSource(args);
  const header = (await sqliteJson(source.sqlitePath, "SELECT * FROM tbl_hdr_header LIMIT 1"))[0] ?? {};
  const cycle = args.cycle || normalizeText(header.cycle) || normalizeText(source.packageInfo?.cycle);

  if (!cycle) {
    throw new Error("Unable to determine AIRAC cycle. Pass --cycle or provide a DFD header with cycle.");
  }

  const revision = normalizeText(source.packageInfo?.revision) || normalizeText(header.revision);
  const sourceFileHash = source.fileInfo?.hash || source.fileHash;
  const packageId = normalizeText(source.packageInfo?.package_id);
  const packageStatus = normalizeText(source.packageInfo?.package_status);
  const format = normalizeText(source.packageInfo?.format);
  const description = normalizeText(source.packageInfo?.description);
  const sourceKey = normalizeText(source.fileInfo?.key) || path.basename(source.sqlitePath);

  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  try {
    if (await shouldSkipImport(client, cycle, revision, sourceFileHash, args.force)) {
      console.log(`AIRAC ${cycle} is already imported; skipping. Use --force to re-import.`);
      return;
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM nav_route_expand_cache WHERE cycle = $1", [cycle]);
    await client.query("DELETE FROM nav_airway_points WHERE cycle = $1", [cycle]);
    await client.query("DELETE FROM nav_waypoints WHERE cycle = $1", [cycle]);

    await client.query(
      `
        INSERT INTO nav_airac_cycles (
          cycle, revision, package_id, package_status, format, description,
          source_key, source_file_hash, dataset_version, effective_fromto,
          parsed_at, header, waypoint_count, airway_point_count
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12::jsonb, 0, 0
        )
        ON CONFLICT (cycle) DO UPDATE SET
          revision = EXCLUDED.revision,
          package_id = EXCLUDED.package_id,
          package_status = EXCLUDED.package_status,
          format = EXCLUDED.format,
          description = EXCLUDED.description,
          source_key = EXCLUDED.source_key,
          source_file_hash = EXCLUDED.source_file_hash,
          dataset_version = EXCLUDED.dataset_version,
          effective_fromto = EXCLUDED.effective_fromto,
          parsed_at = EXCLUDED.parsed_at,
          header = EXCLUDED.header,
          waypoint_count = 0,
          airway_point_count = 0,
          imported_at = NOW()
      `,
      [
        cycle,
        revision,
        packageId,
        packageStatus,
        format,
        description,
        sourceKey,
        sourceFileHash,
        normalizeText(header.dataset_version),
        normalizeText(header.effective_fromto),
        normalizeText(header.parsed_at),
        JSON.stringify(header),
      ],
    );

    const waypointCount = await importWaypoints(client, source.sqlitePath, cycle, batchSize);
    const airwayPointCount = await importAirways(client, source.sqlitePath, cycle, batchSize);

    await client.query(
      `
        UPDATE nav_airac_cycles
        SET waypoint_count = $2,
            airway_point_count = $3
        WHERE cycle = $1
      `,
      [cycle, waypointCount, airwayPointCount],
    );

    if (args.activate) {
      await client.query("UPDATE nav_airac_cycles SET is_active = FALSE");
      await client.query("UPDATE nav_airac_cycles SET is_active = TRUE WHERE cycle = $1", [cycle]);
    }

    await client.query("COMMIT");
    console.log(
      `Imported AIRAC ${cycle}: waypoints=${waypointCount}, airway_points=${airwayPointCount}, active=${args.activate}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
