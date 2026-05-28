import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { IndexSummary } from './useIndexSummary';

/**
 * Shared "indexing in progress" state machine used by every reindex entry
 * point (Splash page Re-index, Admin Library bulk reindex, per-document
 * reindex in Admin Library, Company Library publication reindex). All
 * callers go through this hook so the UX is identical:
 *
 *   1. Caller queues work (e.g. `backfillAll` / `reindexOne`) and calls
 *      `start(queuedCount)` to activate the hook.
 *   2. While active, the hook polls `refetch()` every 2 seconds so the
 *      `IndexSummary` snapshot stays fresh.
 *   3. A 1-second ticker (`nowTick`) is exposed so callers can render an
 *      "X seconds elapsed" counter without polling the server every tick.
 *   4. The hook advances a `highWater` marker whenever `summary.indexed`
 *      improves, so callers can detect stalls (no progress for N seconds).
 *   5. When `indexed >= totalDocs`, or the in-flight queue drains AFTER
 *      real progress, the hook clears itself and emits a success toast.
 *      A 5-minute safety timeout also clears the state, so a wedged
 *      server can never leave the UI stuck.
 *
 * The hook is intentionally agnostic of whether the underlying action is
 * a bulk backfill or a per-document reindex — both kick off the same UI.
 */

const POLL_INTERVAL_MS = 2000;
const TICK_INTERVAL_MS = 1000;
const SAFETY_TIMEOUT_MS = 5 * 60_000;
const STALL_MILD_MS = 30_000;
const STALL_SEVERE_MS = 90_000;

export type IndexingProgressState = {
  startedAt: number;
  queued: number;
  startingIndexed: number;
  startingTotal: number;
  highWater: number;
  highWaterAt: number;
};

export type IndexingProgressResult = {
  /** When non-null, an indexing run is active and the UI should reflect progress. */
  indexingState: IndexingProgressState | null;
  /** Activate the polling state machine. Pass the number of jobs that were just queued. */
  start: (queued: number) => void;
  /** Force-clear the state (rarely needed; the hook auto-clears on completion). */
  stop: () => void;
  /** Number of seconds since indexing started; updates every 1s while active. */
  elapsedSec: number;
  /** Milliseconds since `summary.indexed` last advanced; updates every 1s while active. */
  sinceProgressMs: number;
  /** True once there has been no progress for >= 30s but < 90s. */
  stallMild: boolean;
  /** True once there has been no progress for >= 90s — the run is probably wedged. */
  stallSevere: boolean;
};

export function useIndexingProgress(
  indexSummary: IndexSummary | null,
  refetch: () => Promise<void>,
  options?: {
    /** Override the per-completion toast. Set to null to suppress entirely. */
    successToast?: ((summary: IndexSummary) => string) | null;
  },
): IndexingProgressResult {
  const [indexingState, setIndexingState] = useState<IndexingProgressState | null>(null);
  const [nowTick, setNowTick] = useState(0);

  const start = useCallback(
    (queued: number) => {
      if (queued <= 0) return;
      const now = Date.now();
      const startingIndexed = indexSummary?.indexed ?? 0;
      const startingTotal = indexSummary?.totalDocs ?? queued;
      setIndexingState({
        startedAt: now,
        queued,
        startingIndexed,
        startingTotal,
        highWater: startingIndexed,
        highWaterAt: now,
      });
    },
    [indexSummary?.indexed, indexSummary?.totalDocs],
  );

  const stop = useCallback(() => {
    setIndexingState(null);
  }, []);

  // Poll the summary while indexing is active so callers see live counts.
  useEffect(() => {
    if (!indexingState) return;
    const intervalId = window.setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [indexingState, refetch]);

  // 1-second ticker drives the elapsed counter and stall thresholds.
  useEffect(() => {
    if (!indexingState) return;
    const intervalId = window.setInterval(() => setNowTick((n) => n + 1), TICK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [indexingState]);

  // Track the high-water mark so we can detect lack of progress.
  useEffect(() => {
    if (!indexingState || !indexSummary) return;
    if (indexSummary.indexed > indexingState.highWater) {
      setIndexingState((prev) =>
        prev
          ? {
              ...prev,
              highWater: indexSummary.indexed,
              highWaterAt: Date.now(),
            }
          : prev,
      );
    }
  }, [indexSummary, indexingState]);

  // Completion detection: reached total, queue drained after real progress,
  // or safety timeout.
  useEffect(() => {
    if (!indexingState || !indexSummary) return;
    const total = indexSummary.totalDocs;
    const indexed = indexSummary.indexed;
    const inFlight = indexSummary.inFlight ?? 0;
    const reachedTotal = total > 0 && indexed >= total;
    const drainedAfterProgress =
      inFlight === 0 && indexed > indexingState.startingIndexed;
    if (reachedTotal || drainedAfterProgress) {
      setIndexingState(null);
      if (options?.successToast !== null) {
        const msg = options?.successToast
          ? options.successToast(indexSummary)
          : `Indexing complete — ${indexed} of ${total} document${total === 1 ? '' : 's'} ready for search.`;
        toast.success(msg);
      }
      return;
    }
    if (Date.now() - indexingState.startedAt > SAFETY_TIMEOUT_MS) {
      setIndexingState(null);
    }
  }, [indexSummary, indexingState, options]);

  const elapsedSec = indexingState
    ? Math.floor((Date.now() - indexingState.startedAt) / 1000)
    : 0;
  const sinceProgressMs = indexingState
    ? Date.now() - indexingState.highWaterAt
    : 0;
  const stallMild =
    Boolean(indexingState) && sinceProgressMs >= STALL_MILD_MS && sinceProgressMs < STALL_SEVERE_MS;
  const stallSevere = Boolean(indexingState) && sinceProgressMs >= STALL_SEVERE_MS;

  // Reference nowTick so React keeps the elapsed/stall values fresh.
  void nowTick;

  return {
    indexingState,
    start,
    stop,
    elapsedSec,
    sinceProgressMs,
    stallMild,
    stallSevere,
  };
}
