/**
 * Traceability-run orchestration for the DCT Compliance view.
 *
 * Owns the run UI state, the derived progress/ETA/stale indicators, the
 * start/cancel/resume handlers, and the status-transition toast effect. The
 * actual batch loop runs server-side in the `startTraceabilityRun` Convex
 * action — this hook only builds the args and fires it (fire-and-forget).
 *
 * Spend-safety invariants preserved verbatim from the previous inline code:
 *   - `executeTraceability` refuses to start if a run is already queued/running
 *     (the double-run guard) — no duplicate API spend.
 *   - `docIds` is capped at 40 documents.
 *   - `batchSize` is fixed at {@link TRACEABILITY_BATCH_SIZE} (12 questions/call).
 *   - The action promise is fire-and-forget with a `.catch`; there is no client
 *     retry loop.
 *   - The toast effect fires only on status *transitions* (tracked per run id,
 *     skipping the first sighting) so it never re-triggers a run.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useCancelTraceabilityRun,
  useResumeTraceabilityRun,
  useStartTraceabilityRun,
} from './useConvexData';
import { getDctTraceabilitySystemPrompt } from '../services/auditAgents';
import { getTraceabilityPrereqs } from '../utils/dctTraceabilityPrereqs';
import { DCT_MAX_COMPANY_DOCS } from '../utils/dctSpendLimits';
import type { DctApplicabilityState } from '../utils/dctApplicability';
import type { ActiveTraceabilityRun } from './useDctData';
import type { Id } from '../../convex/_generated/dataModel';

/** Questions per server API batch. Surfaced in the UI ("N questions per API call"). */
export const TRACEABILITY_BATCH_SIZE = 12;

export type { TraceabilityPrereq } from '../utils/dctTraceabilityPrereqs';

export interface UseDctTraceabilityRunParams {
  activeProjectId: string | null | undefined;
  enriched: any[] | undefined;
  /** Metadata-only corpus docs (ids/names). The server action loads text itself from the ids. */
  corpusDocsMeta: any[];
  defaultRunSelection: Set<string>;
  classifiedEnriched: Array<{
    row: any;
    applicability: DctApplicabilityState;
    confidence: number;
  }>;
  activeTraceabilityRun: ActiveTraceabilityRun;
  model: string;
  /** Effective traceability agent id (store value validated by the caller). */
  traceabilityAgentId: string;
  /** Record the comparison-id set that was submitted for a run (shared dialog state). */
  onSelectionSubmitted: (selection: Set<string>) => void;
}

export function useDctTraceabilityRun({
  activeProjectId,
  enriched,
  corpusDocsMeta,
  defaultRunSelection,
  classifiedEnriched,
  activeTraceabilityRun,
  model,
  traceabilityAgentId,
  onSelectionSubmitted,
}: UseDctTraceabilityRunParams) {
  const startTraceabilityRun = useStartTraceabilityRun();
  const cancelTraceabilityRun = useCancelTraceabilityRun();
  const resumeTraceabilityRun = useResumeTraceabilityRun();

  /**
   * Local "starting" flag bridges the gap between the user's click and the
   * server creating the run row. It stays set until `activeTraceabilityRun`
   * shows status `queued`/`running` (see effect below), the start rejects, or
   * a timeout backstop fires — closing the double-click window where two paid
   * runs could both pass the "already in progress" check. The ref mirrors the
   * state so rapid double-invokes are caught before React re-renders.
   */
  const [startingTrace, setStartingTrace] = useState(false);
  const startingTraceRef = useRef(false);
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setStarting = (value: boolean) => {
    startingTraceRef.current = value;
    setStartingTrace(value);
    if (!value && startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = null;
    }
  };
  // Server row observed — it is now the source of truth for "running".
  useEffect(() => {
    if (
      startingTraceRef.current &&
      (activeTraceabilityRun?.status === 'queued' ||
        activeTraceabilityRun?.status === 'running')
    ) {
      setStarting(false);
    }
  }, [activeTraceabilityRun?.status]);
  useEffect(() => () => {
    if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
  }, []);

  const [cancellingTrace, setCancellingTrace] = useState(false);
  /**
   * Run ids the user has dismissed the post-run summary banner for.
   * Keeps the banner sticky until the user explicitly acknowledges it, so a
   * failed/empty run doesn't quietly look like "nothing happened".
   */
  const [dismissedRunSummaryIds, setDismissedRunSummaryIds] = useState<Set<string>>(new Set());
  const [showLastBadResponse, setShowLastBadResponse] = useState(false);
  useEffect(() => {
    setShowLastBadResponse(false);
  }, [activeTraceabilityRun?._id]);

  /**
   * Traceability run state is derived from the server `dctTraceabilityRuns`
   * row when one exists, plus a brief `startingTrace` flag for the gap between
   * click and row creation.
   */
  const traceRunning =
    startingTrace ||
    ((activeTraceabilityRun?.status === 'queued' ||
      activeTraceabilityRun?.status === 'running') &&
      !activeTraceabilityRun?.cancelRequested);

  const traceProgress = useMemo(() => {
    if (
      activeTraceabilityRun?.status === 'running' ||
      activeTraceabilityRun?.status === 'queued'
    ) {
      return {
        processed: activeTraceabilityRun.processed ?? 0,
        total: activeTraceabilityRun.total ?? 0,
      };
    }
    return { processed: 0, total: 0 };
  }, [activeTraceabilityRun]);

  const traceEtaLabel = useMemo(() => {
    if (
      !activeTraceabilityRun?.startedAt ||
      traceProgress.processed <= 0 ||
      traceProgress.total <= traceProgress.processed
    ) {
      return null;
    }
    const elapsedMs = Date.now() - new Date(activeTraceabilityRun.startedAt).getTime();
    if (elapsedMs < 30_000) return null;
    const perItemMs = elapsedMs / traceProgress.processed;
    const remainingMs = perItemMs * (traceProgress.total - traceProgress.processed);
    const remainingMin = Math.ceil(remainingMs / 60_000);
    if (remainingMin < 2) return '~1 min left';
    if (remainingMin < 120) return `~${remainingMin} min left`;
    const hours = Math.floor(remainingMin / 60);
    const mins = remainingMin % 60;
    return mins > 0 ? `~${hours}h ${mins}m left` : `~${hours}h left`;
  }, [activeTraceabilityRun?.startedAt, traceProgress.processed, traceProgress.total]);

  const traceRunStale = useMemo(() => {
    if (
      activeTraceabilityRun?.status !== 'running' &&
      activeTraceabilityRun?.status !== 'queued'
    ) {
      return false;
    }
    const heartbeat = activeTraceabilityRun?.lastHeartbeatAt;
    if (!heartbeat) return false;
    return Date.now() - new Date(heartbeat).getTime() > 2.5 * 60 * 1000;
  }, [activeTraceabilityRun]);

  const tracePct =
    traceProgress.total > 0
      ? Math.min(100, Math.round((traceProgress.processed / traceProgress.total) * 100))
      : 0;

  /**
   * Button label for any "Run traceability" action. Shows per-question progress
   * while a run is in flight so the user can see forward motion instead of a
   * motionless "Running…".
   */
  const traceButtonLabel = traceRunning
    ? traceProgress.total > 0
      ? `Running… ${traceProgress.processed}/${traceProgress.total}`
      : 'Running…'
    : defaultRunSelection.size > 0
      ? `Run traceability on ${defaultRunSelection.size} item${defaultRunSelection.size === 1 ? '' : 's'}`
      : 'Run traceability';

  /** Hard prerequisites for starting a run, recomputed as inputs settle. */
  const prereqs = useMemo(
    () =>
      getTraceabilityPrereqs({
        hasProject: !!activeProjectId,
        enrichedCount: enriched?.length ?? 0,
        corpusDocCount: corpusDocsMeta.length,
        defaultSelectionSize: defaultRunSelection.size,
      }),
    [activeProjectId, enriched?.length, corpusDocsMeta.length, defaultRunSelection.size],
  );

  /**
   * Kick off a server-orchestrated traceability run for the selected rows.
   * The Convex action owns the batch loop end-to-end; this function only
   * builds the args and fires the action. Progress, completion toasts, and
   * cancellation are driven by `activeTraceabilityRun` (see effect below).
   *
   * Fire-and-forget by design: the action's returned promise resolves when
   * the whole run finishes (minutes later), so we attach error handling but
   * don't `await` it on the click path. The UI stays responsive and the run
   * keeps going even if the user navigates away.
   */
  const executeTraceability = async (selectedIds: Set<string>) => {
    if (!activeProjectId || !enriched?.length) return;
    if (!corpusDocsMeta.length) return;
    if (selectedIds.size === 0) {
      toast.error('No DCT questions selected.');
      return;
    }
    if (
      startingTraceRef.current ||
      activeTraceabilityRun?.status === 'queued' ||
      activeTraceabilityRun?.status === 'running'
    ) {
      toast.error('A traceability run is already in progress for this project.');
      return;
    }

    // Per-comparison applicability + low-confidence are passed as arrays (not
    // records) because Convex caps records at 1024 fields and selections can
    // reach the 1500-row matrix cap. Server reconstructs the lookup maps.
    const applicabilityByComparisonId: Array<{
      comparisonId: string;
      applicability: DctApplicabilityState;
    }> = [];
    const lowConfidenceByComparisonId: Array<{ comparisonId: string; value: boolean }> = [];
    for (const { row, applicability } of classifiedEnriched) {
      const id = String(row.comparison._id);
      if (!selectedIds.has(id)) continue;
      applicabilityByComparisonId.push({ comparisonId: id, applicability });
      lowConfidenceByComparisonId.push({ comparisonId: id, value: applicability === 'unsure' });
    }

    const comparisonIds = Array.from(selectedIds) as Id<'dctComparisons'>[];
    // Cap company docs ({@link DCT_MAX_COMPANY_DOCS}); the action filters out
    // docs without extracted text server-side.
    const docIds = corpusDocsMeta
      .slice(0, DCT_MAX_COMPANY_DOCS)
      .map((d: any) => String(d._id)) as Id<'documents'>[];

    setStarting(true);
    // Backstop: if the run row never appears (action silently dropped), release
    // the guard so the user isn't locked out of starting a run.
    startingTimeoutRef.current = setTimeout(() => setStarting(false), 60_000);

    const batchCount = Math.ceil(comparisonIds.length / TRACEABILITY_BATCH_SIZE);
    const estMinutes = Math.max(8, Math.round((batchCount * 25) / 60));

    startTraceabilityRun({
      projectId: activeProjectId as Id<'projects'>,
      comparisonIds,
      docIds,
      model,
      agentId: traceabilityAgentId,
      systemPrompt: getDctTraceabilitySystemPrompt(traceabilityAgentId),
      applicabilityByComparisonId,
      lowConfidenceByComparisonId,
      batchSize: TRACEABILITY_BATCH_SIZE,
    } as any).catch((err: unknown) => {
      // Action rejected (auth, missing API key, etc.) — surface immediately.
      // Mid-run failures land on the run row instead, picked up by the
      // completion effect below.
      setStarting(false);
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Traceability run failed to start: ${message}`);
    });
    toast.success(
      `Traceability started on ${comparisonIds.length} requirements (~${batchCount} API batches, often ${estMinutes}–${estMinutes * 2} min). It keeps running on the server if you leave this page.`,
      { duration: 8000 },
    );
  };

  /**
   * Direct-run traceability on the auto-selected applicable+unsure set.
   * Users who want to hand-pick can open the modal via "Customize selection…".
   */
  const handleRunTraceability = () => {
    // Backstop for the pre-flight checklist UI — same checks, same copy.
    const firstUnmet = prereqs.find((p) => !p.met);
    if (firstUnmet) {
      toast.error(firstUnmet.message);
      return;
    }
    onSelectionSubmitted(new Set(defaultRunSelection));
    void executeTraceability(defaultRunSelection);
  };

  /**
   * Watch the active run for status transitions and fire the appropriate
   * end-of-run toast. We track the last observed status per run id so we
   * only fire on transitions (not on every progress tick), and we skip the
   * first sighting of a run so a stale completed/failed row from a previous
   * session doesn't toast on page load.
   */
  const prevTraceRunStatusRef = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!activeTraceabilityRun) {
      prevTraceRunStatusRef.current = null;
      return;
    }
    const { _id, status, persisted, persistFailed, parseFailed, total, error } =
      activeTraceabilityRun;
    const prev = prevTraceRunStatusRef.current;
    if (!prev || prev.id !== _id) {
      prevTraceRunStatusRef.current = { id: _id, status };
      return;
    }
    if (prev.status === status) return;
    prevTraceRunStatusRef.current = { id: _id, status };

    if (status === 'completed') {
      if (persistFailed > 0) {
        toast.error(
          `Run finished — ${persistFailed} row(s) classified by AI but failed to save.`,
          {
            description:
              persisted > 0 ? `${persisted} other row(s) saved successfully.` : undefined,
          },
        );
      } else if (parseFailed > 0) {
        toast.warning(
          `Applied traceability to ${persisted} of ${total} requirement(s).`,
          {
            description: `${parseFailed} batch(es) returned bad output and were skipped — re-run if needed.`,
          },
        );
      } else {
        toast.success(`Applied traceability to ${persisted} requirement(s).`);
      }
    } else if (status === 'failed') {
      toast.error(`Traceability run failed: ${error ?? 'unknown error'}`);
    } else if (status === 'cancelled') {
      toast.warning(
        `Run cancelled — ${persisted} of ${total} requirement(s) saved.`,
      );
    }
  }, [activeTraceabilityRun]);

  /** Cooperative cancel — the action sees `cancelRequested` between batches and exits cleanly. */
  const handleCancelTraceabilityRun = async () => {
    if (!activeTraceabilityRun?._id) return;
    if (
      activeTraceabilityRun.status !== 'queued' &&
      activeTraceabilityRun.status !== 'running'
    ) {
      return;
    }
    setCancellingTrace(true);
    try {
      await cancelTraceabilityRun({ runId: activeTraceabilityRun._id as any });
      toast.success('Traceability run cancelled.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to cancel run');
    } finally {
      setCancellingTrace(false);
    }
  };

  return {
    prereqs,
    traceRunning,
    traceProgress,
    traceEtaLabel,
    traceRunStale,
    tracePct,
    traceButtonLabel,
    cancellingTrace,
    dismissedRunSummaryIds,
    setDismissedRunSummaryIds,
    showLastBadResponse,
    setShowLastBadResponse,
    handleRunTraceability,
    executeTraceability,
    handleCancelTraceabilityRun,
    resumeTraceabilityRun,
  };
}
