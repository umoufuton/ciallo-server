import { getDb } from "@/lib/db";

export type NavAiracStatus = {
  cycle: string;
  revision: string | null;
  package_status: string | null;
  format: string | null;
  source_key: string | null;
  dataset_version: string | null;
  effective_fromto: string | null;
  waypoint_count: number;
  airway_point_count: number;
  is_active: boolean;
  imported_at: string;
  updated_at: string;
};

export async function getActiveAiracStatus() {
  const db = getDb();
  const result = await db.query<NavAiracStatus>(
    `
      SELECT
        cycle,
        revision,
        package_status,
        format,
        source_key,
        dataset_version,
        effective_fromto,
        waypoint_count,
        airway_point_count,
        is_active,
        imported_at,
        updated_at
      FROM nav_airac_cycles
      WHERE is_active = TRUE
      ORDER BY imported_at DESC
      LIMIT 1
    `,
  );

  return result.rows[0] ?? null;
}

export async function listAiracStatuses() {
  const db = getDb();
  const result = await db.query<NavAiracStatus>(
    `
      SELECT
        cycle,
        revision,
        package_status,
        format,
        source_key,
        dataset_version,
        effective_fromto,
        waypoint_count,
        airway_point_count,
        is_active,
        imported_at,
        updated_at
      FROM nav_airac_cycles
      ORDER BY cycle DESC, imported_at DESC
      LIMIT 12
    `,
  );

  return result.rows;
}
