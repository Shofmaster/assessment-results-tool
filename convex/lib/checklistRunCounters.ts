/**
 * Denormalized item counters on `auditChecklistRuns`.
 *
 * `qualityDashboard.getCommandCenterSummary` is subscribed from the
 * always-mounted sidebar, so reading every `auditChecklistItems` row per run
 * just to compute progress counts re-bills the whole item set on each change.
 * Instead each run row carries `itemsTotal` / `itemsComplete` /
 * `itemsInProgress`, kept in sync transactionally by every mutation that
 * inserts, deletes, or changes the status of an item. Existing runs are
 * initialized via `migrationsBandwidth.backfillChecklistRunCounters`.
 */

import type { Id } from "../_generated/dataModel";

export type RunCounterDelta = {
  total: number;
  complete: number;
  inProgress: number;
};

export type RunCounters = {
  itemsTotal: number;
  itemsComplete: number;
  itemsInProgress: number;
};

function bucket(status: string | null): RunCounterDelta {
  return {
    total: status === null ? 0 : 1,
    complete: status === "complete" ? 1 : 0,
    inProgress: status === "in_progress" ? 1 : 0,
  };
}

/**
 * Counter delta for a single item transition. `oldStatus === null` means the
 * item is being inserted; `newStatus === null` means it is being deleted.
 */
export function counterDeltaForItemChange(
  oldStatus: string | null,
  newStatus: string | null,
): RunCounterDelta {
  const before = bucket(oldStatus);
  const after = bucket(newStatus);
  return {
    total: after.total - before.total,
    complete: after.complete - before.complete,
    inProgress: after.inProgress - before.inProgress,
  };
}

/** Exact counters recomputed from a list of item statuses (backfill / bulk insert). */
export function countersFromStatuses(statuses: string[]): RunCounters {
  return {
    itemsTotal: statuses.length,
    itemsComplete: statuses.filter((s) => s === "complete").length,
    itemsInProgress: statuses.filter((s) => s === "in_progress").length,
  };
}

/** Counters for a freshly created run whose items all start `not_started`. */
export function initialRunCounters(totalItems: number): RunCounters {
  return { itemsTotal: totalItems, itemsComplete: 0, itemsInProgress: 0 };
}

/**
 * Apply a counter delta to a run row, merged with `extraPatch` (typically
 * `{ updatedAt }`) so callers keep a single patch per run.
 *
 * Runs created before the counters existed have `itemsTotal === undefined`;
 * for those the delta is skipped (counters stay undefined, and
 * `getCommandCenterSummary` falls back to reading items) until the one-shot
 * backfill initializes them — incrementing from an unknown base would
 * produce wrong counts.
 */
export async function applyRunCounterDelta(
  ctx: { db: any },
  runId: Id<"auditChecklistRuns">,
  delta: RunCounterDelta,
  extraPatch: Record<string, unknown> = {},
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run) return;
  const patch: Record<string, unknown> = { ...extraPatch };
  const hasDelta = delta.total !== 0 || delta.complete !== 0 || delta.inProgress !== 0;
  if (run.itemsTotal !== undefined && hasDelta) {
    patch.itemsTotal = Math.max(0, (run.itemsTotal ?? 0) + delta.total);
    patch.itemsComplete = Math.max(0, (run.itemsComplete ?? 0) + delta.complete);
    patch.itemsInProgress = Math.max(0, (run.itemsInProgress ?? 0) + delta.inProgress);
  }
  if (Object.keys(patch).length === 0) return;
  await ctx.db.patch(runId, patch);
}
