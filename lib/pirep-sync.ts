import { getDb } from "@/lib/db";
import {
  fetchOpsPirepDetailById,
  fetchOpsPirepPositionReportsById,
  fetchOpsPirepsByPilotId,
} from "@/lib/external-platform";
import { upsertPilotPirep } from "@/lib/pireps";
import { findPilotById } from "@/lib/pilots";

type SyncStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export type PilotPirepSyncState = {
  pilot_id: number;
  source_pilot_id: number;
  status: SyncStatus;
  initial_backfill_done: boolean;
  processed_count: number;
  imported_count: number;
  updated_count: number;
  retry_count: number;
  next_cursor: string | null;
  queued_at: string;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const inMemoryRunning = new Set<number>();

function extractPirepId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function mergeOpsDetailWithPositionReports(detail: unknown, positionReports: Record<string, unknown>[]) {
  if (!detail || typeof detail !== "object") {
    return {
      data: {
        position_reports: positionReports,
      },
    } as Record<string, unknown>;
  }

  const detailObject = detail as Record<string, unknown>;
  const nestedData =
    detailObject.data && typeof detailObject.data === "object"
      ? { ...(detailObject.data as Record<string, unknown>) }
      : null;

  if (nestedData) {
    nestedData.position_reports = positionReports;
    return {
      ...detailObject,
      data: nestedData,
    };
  }

  return {
    ...detailObject,
    position_reports: positionReports,
  };
}

export async function getPilotPirepSyncState(pilotId: number) {
  const db = getDb();
  const result = await db.query<PilotPirepSyncState>(
    `
      SELECT *
      FROM pilot_pirep_sync_state
      WHERE pilot_id = $1
      LIMIT 1
    `,
    [pilotId],
  );

  return result.rows[0] ?? null;
}

export async function enqueuePilotPirepBackfill(params: {
  pilotId: number;
  sourcePilotId: number | null;
}) {
  if (!params.sourcePilotId) {
    return null;
  }

  const db = getDb();
  const result = await db.query<PilotPirepSyncState>(
    `
      INSERT INTO pilot_pirep_sync_state (
        pilot_id,
        source_pilot_id,
        status,
        queued_at,
        last_error,
        next_cursor
      ) VALUES (
        $1, $2, 'QUEUED', NOW(), NULL, NULL
      )
      ON CONFLICT (pilot_id) DO UPDATE SET
        source_pilot_id = EXCLUDED.source_pilot_id,
        status = CASE
          WHEN pilot_pirep_sync_state.initial_backfill_done THEN pilot_pirep_sync_state.status
          WHEN pilot_pirep_sync_state.status = 'RUNNING' THEN 'RUNNING'
          ELSE 'QUEUED'
        END,
        queued_at = CASE
          WHEN pilot_pirep_sync_state.initial_backfill_done THEN pilot_pirep_sync_state.queued_at
          WHEN pilot_pirep_sync_state.status = 'RUNNING' THEN pilot_pirep_sync_state.queued_at
          ELSE NOW()
        END,
        last_error = CASE
          WHEN pilot_pirep_sync_state.initial_backfill_done THEN pilot_pirep_sync_state.last_error
          WHEN pilot_pirep_sync_state.status = 'RUNNING' THEN pilot_pirep_sync_state.last_error
          ELSE NULL
        END
      RETURNING *
    `,
    [params.pilotId, params.sourcePilotId],
  );

  return result.rows[0] ?? null;
}

async function markFailed(params: { pilotId: number; message: string; nextCursor?: string | null }) {
  const db = getDb();
  await db.query(
    `
      UPDATE pilot_pirep_sync_state
      SET
        status = 'FAILED',
        retry_count = retry_count + 1,
        last_error = $2,
        next_cursor = COALESCE($3, next_cursor),
        last_finished_at = NOW()
      WHERE pilot_id = $1
    `,
    [params.pilotId, params.message.slice(0, 2000), params.nextCursor ?? null],
  );
}

async function claimForRunning(pilotId: number) {
  const db = getDb();
  const result = await db.query<PilotPirepSyncState>(
    `
      UPDATE pilot_pirep_sync_state
      SET
        status = 'RUNNING',
        last_started_at = NOW(),
        last_error = NULL
      WHERE pilot_id = $1
        AND (
          status = 'QUEUED'
          OR status = 'FAILED'
        )
      RETURNING *
    `,
    [pilotId],
  );

  return result.rows[0] ?? null;
}

export async function processPilotPirepBackfill(pilotId: number) {
  if (inMemoryRunning.has(pilotId)) {
    return { started: false, reason: "already_running" as const };
  }

  inMemoryRunning.add(pilotId);
  try {
    const claimed = await claimForRunning(pilotId);
    if (!claimed) {
      return { started: false, reason: "not_queued" as const };
    }

    const pilot = await findPilotById(pilotId);
    if (!pilot?.source_pilot_id) {
      await markFailed({
        pilotId,
        message: "pilot has no source_pilot_id",
      });
      return { started: false, reason: "no_source_pilot_id" as const };
    }

    let cursor: string | null = claimed.next_cursor ?? null;
    let processed = 0;

    while (true) {
      const page = await fetchOpsPirepsByPilotId({
        sourcePilotId: pilot.source_pilot_id,
        cursor,
        pageSize: 50,
      });

      const items = page.items;
      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        const sourcePirepId = extractPirepId(item?.id);
        if (!sourcePirepId) continue;

        const detail = await fetchOpsPirepDetailById(sourcePirepId);
        const positionReports = await fetchOpsPirepPositionReportsById(sourcePirepId).catch((error) => {
          console.warn(
            `[pirep-sync] failed to fetch position reports for source_pirep_id=${sourcePirepId}:`,
            error instanceof Error ? error.message : String(error),
          );
          return [];
        });
        const mergedPayload = mergeOpsDetailWithPositionReports(detail, positionReports);
        await upsertPilotPirep({
          pilotId: pilot.id,
          fallbackUsername: pilot.username,
          payload: mergedPayload as Record<string, unknown>,
        });

        processed += 1;
      }

      cursor = page.nextCursor ?? null;
      const db = getDb();
      await db.query(
        `
          UPDATE pilot_pirep_sync_state
          SET
            processed_count = processed_count + $2,
            imported_count = imported_count + $2,
            next_cursor = $3
          WHERE pilot_id = $1
        `,
        [pilotId, items.length, cursor],
      );

      if (!cursor) break;
    }

    const db = getDb();
    await db.query(
      `
        UPDATE pilot_pirep_sync_state
        SET
          status = 'DONE',
          initial_backfill_done = TRUE,
          next_cursor = NULL,
          last_finished_at = NOW(),
          last_error = NULL
        WHERE pilot_id = $1
      `,
      [pilotId],
    );

    return { started: true, processed };
  } catch (error) {
    await markFailed({
      pilotId,
      message: error instanceof Error ? error.message : "pirep backfill failed",
    });
    return { started: true, processed: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    inMemoryRunning.delete(pilotId);
  }
}

export async function enqueueAndKickPilotPirepBackfill(params: {
  pilotId: number;
  sourcePilotId: number | null;
}) {
  const state = await enqueuePilotPirepBackfill(params);
  if (!state || state.initial_backfill_done) {
    return state;
  }

  void processPilotPirepBackfill(params.pilotId);
  return state;
}
