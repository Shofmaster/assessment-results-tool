import { useCallback, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { useQuery } from './useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';
import {
  navAttentionLevel,
  navAttentionTitle,
  scopeReadinessLevel,
  type CommandCenterSummaryLike,
} from '../utils/readinessSeverity';

export function useReadinessSummary(opts: {
  isAerogapEmployee: boolean;
  activeCompanyId: string | undefined;
}): {
  summary: CommandCenterSummaryLike | undefined;
  scopeLevel: ReturnType<typeof scopeReadinessLevel>;
  /** Attention-only: overdue / due soon per nav destination. */
  navDotProps: (path: string) => { level: 'overdue' | 'due_soon'; title: string } | null;
} {
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const summary = useQuery(
    api.qualityDashboard.getCommandCenterSummary,
    activeProjectId ? { projectId: activeProjectId as any } : 'skip',
  ) as CommandCenterSummaryLike | undefined;

  const scopeLevel = useMemo(
    () =>
      scopeReadinessLevel({
        activeProjectId,
        isAerogapEmployee: opts.isAerogapEmployee,
        activeCompanyId: opts.activeCompanyId ?? undefined,
        summary,
      }),
    [activeProjectId, opts.isAerogapEmployee, opts.activeCompanyId, summary],
  );

  const navDotProps = useCallback(
    (path: string) => {
      const level = navAttentionLevel(path, summary, Boolean(activeProjectId));
      if (!level) return null;
      return { level, title: navAttentionTitle(level) };
    },
    [summary, activeProjectId],
  );

  return { summary, scopeLevel, navDotProps };
}
