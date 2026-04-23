import { getDb } from "@/lib/db";

export type RankRecord = {
  id: number;
  source_rank_id: number;
  airline_id: number;
  level: number;
  name: string;
  abbreviation: string | null;
  description: string | null;
  image_url: string | null;
  honorary_rank: boolean;
  required_hours: number;
  required_points: number;
  required_bonus: number;
  required_pireps: number;
  show_abbreviation: boolean;
  abbreviation_position: string | null;
  abbreviation_separator: string | null;
  regular_pilots_count: number | null;
  honorary_pilots_count: number | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type RankListFilters = {
  q?: string;
  airlineId?: number;
  honoraryRank?: boolean;
  limit?: number;
};

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
}

export async function listRanks(filters: RankListFilters) {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.q) {
    const index = values.push(`%${filters.q.trim()}%`);
    conditions.push(`(name ILIKE $${index} OR COALESCE(abbreviation, '') ILIKE $${index})`);
  }

  if (typeof filters.airlineId === "number" && Number.isFinite(filters.airlineId)) {
    const index = values.push(filters.airlineId);
    conditions.push(`airline_id = $${index}`);
  }

  if (typeof filters.honoraryRank === "boolean") {
    const index = values.push(filters.honoraryRank);
    conditions.push(`honorary_rank = $${index}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(normalizeLimit(filters.limit));

  const result = await db.query<RankRecord>(
    `
      SELECT *
      FROM ranks
      ${whereClause}
      ORDER BY airline_id ASC, level ASC, source_rank_id ASC
      LIMIT $${limitIndex}
    `,
    values,
  );

  return result.rows;
}

export async function getRankByIdentifier(identifier: string) {
  const db = getDb();
  const trimmed = identifier.trim();
  const numericId = Number.parseInt(trimmed, 10);

  if (!Number.isNaN(numericId)) {
    const bySourceOrInternal = await db.query<RankRecord>(
      `
        SELECT *
        FROM ranks
        WHERE source_rank_id = $1 OR id = $1
        ORDER BY source_rank_id = $1 DESC
        LIMIT 1
      `,
      [numericId],
    );

    if (bySourceOrInternal.rows[0]) {
      return bySourceOrInternal.rows[0];
    }
  }

  const byName = await db.query<RankRecord>(
    `
      SELECT *
      FROM ranks
      WHERE LOWER(name) = LOWER($1) OR LOWER(COALESCE(abbreviation, '')) = LOWER($1)
      LIMIT 1
    `,
    [trimmed],
  );

  return byName.rows[0] ?? null;
}
