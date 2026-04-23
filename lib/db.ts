import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __phoenixPgPool: Pool | undefined;
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  return databaseUrl;
}

export function getDb() {
  if (global.__phoenixPgPool) {
    return global.__phoenixPgPool;
  }

  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
  });

  global.__phoenixPgPool = pool;
  return pool;
}
