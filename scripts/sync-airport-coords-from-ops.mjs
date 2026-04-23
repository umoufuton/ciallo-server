import pg from "pg";

const { Client } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is not set`);
  }
  return value.trim();
}

function readEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) return null;
  return value.trim();
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

async function getOpsAccessToken() {
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

  if (!response.ok) {
    throw new Error(`getOpsAccessToken failed with status ${response.status}`);
  }

  const payload = await response.json();
  const token = payload?.access_token?.trim();
  if (!token) {
    throw new Error("getOpsAccessToken returned empty access_token");
  }
  return token;
}

function buildOpsAirportsUrl(cursor) {
  const base = readEnv("OPS_API_BASE_URL") ?? "https://vamsys.io/api/v3/operations";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const pageSize = Math.min(Math.max(Number.parseInt(process.env.OPS_PAGE_SIZE ?? "100", 10) || 100, 1), 100);
  const airlineId = readEnv("OPS_AIRLINE_ID");

  const query = new URLSearchParams();
  query.set("page[size]", String(pageSize));
  if (cursor) query.set("page[cursor]", cursor);
  if (airlineId) query.set("filter[airline_id]", airlineId);

  return `${normalizedBase}/airports?${query.toString()}`;
}

async function fetchAllOpsAirports(token) {
  const items = [];
  let cursor = null;

  while (true) {
    const url = buildOpsAirportsUrl(cursor);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`fetch ops airports failed with status ${response.status}`);
    }

    const payload = await response.json();
    const pageItems = Array.isArray(payload?.data) ? payload.data : [];
    items.push(...pageItems);

    const nextCursor =
      payload?.meta?.next_cursor ??
      payload?.meta?.nextCursor ??
      null;

    if (!nextCursor) break;
    cursor = String(nextCursor);
  }

  return items;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const token = await getOpsAccessToken();
  const opsAirports = await fetchAllOpsAirports(token);

  if (opsAirports.length === 0) {
    console.log("No airports returned from Ops API.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let updated = 0;
  let noCoordinate = 0;
  let unmatched = 0;

  try {
    await client.query("BEGIN");

    for (const rawAirport of opsAirports) {
      const sourceAirportId = Number.parseInt(String(rawAirport?.id ?? ""), 10);
      const icao = String(rawAirport?.icao ?? "").trim().toUpperCase();
      const latitude = parseNullableNumber(rawAirport?.latitude);
      const longitude = parseNullableNumber(rawAirport?.longitude);
      const countryIso2 = String(rawAirport?.country?.iso2 ?? "").trim().toUpperCase() || null;
      const countryName = String(rawAirport?.country?.name ?? "").trim() || null;

      if (!Number.isFinite(sourceAirportId) && !icao) {
        continue;
      }

      if (latitude === null || longitude === null) {
        noCoordinate += 1;
        continue;
      }

      const result = await client.query(
        `
          UPDATE airports
          SET
            latitude = $1,
            longitude = $2,
            country_iso2 = COALESCE($3, country_iso2),
            country_name = COALESCE($4, country_name)
          WHERE
            ($5::bigint IS NOT NULL AND source_airport_id = $5)
            OR ($6 <> '' AND UPPER(icao_code) = $6)
            OR ($6 <> '' AND UPPER(COALESCE(source_airport_icao, '')) = $6)
        `,
        [latitude, longitude, countryIso2, countryName, Number.isFinite(sourceAirportId) ? sourceAirportId : null, icao],
      );

      if (result.rowCount && result.rowCount > 0) {
        updated += result.rowCount;
      } else {
        unmatched += 1;
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    `Ops airports: ${opsAirports.length}, updated rows: ${updated}, missing coordinates: ${noCoordinate}, unmatched airports: ${unmatched}`,
  );
}

await main();

