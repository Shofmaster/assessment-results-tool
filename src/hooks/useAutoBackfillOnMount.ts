import { useEffect } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { IndexSummary } from './useIndexSummary';

type BackfillResult = {
  queued: number;
  total: number;
  skippedNoText: number;
  skippedCategory: number;
};

function sessionKeyFor(projectId: string): string {
  return `splashAutoBackfill:${projectId}`;
}

function eligibleUnindexedCount(summary: IndexSummary | null): number {
  if (!summary) return 0;
  return summary.perDoc.filter((d) => d.reason.startsWith('eligible')).length;
}

export function useAutoBackfillOnMount(
  projectId: Id<'projects'> | null | undefined,
  summary: IndexSummary | null,
  refetch: () => Promise<void>,
): void {
  const convex = useConvex();

  useEffect(() => {
    if (!projectId || !summary) return;

    const eligible = eligibleUnindexedCount(summary);
    if (eligible <= 0) return;

    const key = sessionKeyFor(String(projectId));
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage unavailable — proceed anyway so the user still benefits
    }

    let cancelled = false;
    (async () => {
      try {
        const result = (await convex.action((api as any).documentChunks.backfillAll, {
          projectId,
        })) as BackfillResult;
        if (cancelled) return;
        if (result?.queued > 0) {
          toast.success(
            `Indexing ${result.queued} manual${result.queued === 1 ? '' : 's'} for search…`,
          );
          // Give the scheduler a moment, then refresh the summary so the badge updates.
          window.setTimeout(() => {
            if (!cancelled) void refetch();
          }, 1500);
        }
      } catch {
        // Silent — don't disturb the user on auto-backfill failures
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, summary, convex, refetch]);
}
