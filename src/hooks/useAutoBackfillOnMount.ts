import { useEffect } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { IndexSummary } from './useIndexSummary';
import { indexingUnavailableToast, isIndexingUnavailableError } from '../utils/indexingEnvMessage';

type BackfillResult = {
  queued: number;
  total: number;
  skippedNoText: number;
  skippedCategory: number;
};

function sessionKeyFor(scopeKey: string): string {
  return `splashAutoBackfill:${scopeKey}`;
}

function eligibleUnindexedCount(summary: IndexSummary | null): number {
  if (!summary) return 0;
  return summary.perDoc.filter((d) => d.reason.startsWith('eligible')).length;
}

type BackfillScope =
  | { companyId: Id<'companies'>; projectId?: never }
  | { projectId: Id<'projects'>; companyId?: never };

export function useAutoBackfillOnMount(
  scope: BackfillScope | null | undefined,
  summary: IndexSummary | null,
  refetch: () => Promise<void>,
  onBackfillStarted?: (queued: number) => void,
): void {
  const convex = useConvex();
  const scopeKey = scope?.companyId
    ? `company:${String(scope.companyId)}`
    : scope?.projectId
      ? `project:${String(scope.projectId)}`
      : null;

  useEffect(() => {
    if (!scopeKey || !scope || !summary) return;

    const eligible = eligibleUnindexedCount(summary);
    if (eligible <= 0) return;

    const key = sessionKeyFor(scopeKey);
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage unavailable — proceed anyway so the user still benefits
    }

    let cancelled = false;
    (async () => {
      try {
        const backfillArgs = scope.companyId
          ? { companyId: scope.companyId }
          : { projectId: scope.projectId! };
        const result = (await convex.action((api as any).documentChunks.backfillAll, backfillArgs)) as BackfillResult;
        if (cancelled) return;
        if (result?.queued > 0) {
          toast.success(
            `Indexing ${result.queued} manual${result.queued === 1 ? '' : 's'} for search…`,
          );
          onBackfillStarted?.(result.queued);
          // Give the scheduler a moment, then refresh the summary so the badge updates.
          window.setTimeout(() => {
            if (!cancelled) void refetch();
          }, 1500);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        if (isIndexingUnavailableError(message)) {
          toast.error(indexingUnavailableToast(), { duration: Infinity });
        }
        // Other failures stay silent — auto-backfill is best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scopeKey, scope, summary, convex, refetch, onBackfillStarted]);
}
