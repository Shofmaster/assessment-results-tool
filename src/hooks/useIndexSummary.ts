import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export type IndexDocState = 'indexed' | 'failed' | 'inFlight' | 'eligible' | 'skipped';

export type IndexSummaryPerDoc = {
  documentId: string;
  name: string;
  category: string;
  hasText: boolean;
  hasTextStorage: boolean;
  chunkCount: number;
  reason: string;
  state?: IndexDocState;
  attempts?: number;
  lastError?: string;
  errorCode?: string;
  lastAttemptedAt?: string;
};

export type IndexSummary = {
  totalDocs: number;
  totalChunks: number;
  indexed: number;
  failed?: number;
  inFlight?: number;
  lastErrorCode?: string;
  perDoc: IndexSummaryPerDoc[];
};

type UseIndexSummaryResult = {
  summary: IndexSummary | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

type UseIndexSummaryScope =
  | { projectId: Id<'projects'> | null | undefined; companyId?: never }
  | { companyId: Id<'companies'> | null | undefined; projectId?: never };

export function useIndexSummary(scope: UseIndexSummaryScope): UseIndexSummaryResult {
  const convex = useConvex();
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeScopeRef = useRef<string | null>(null);
  const scopeKey = scope.companyId
    ? `company:${String(scope.companyId)}`
    : scope.projectId
      ? `project:${String(scope.projectId)}`
      : null;

  const fetchSummary = useCallback(async (): Promise<void> => {
    if (!scopeKey) {
      setSummary(null);
      return;
    }
    setIsLoading(true);
    try {
      const args = scope.companyId
        ? { companyId: scope.companyId }
        : { projectId: scope.projectId! };
      const result = (await convex.action((api as any).documentChunks.indexSummary, args)) as IndexSummary;
      if (activeScopeRef.current === scopeKey) {
        setSummary(result);
      }
    } catch {
      if (activeScopeRef.current === scopeKey) {
        setSummary(null);
      }
    } finally {
      if (activeScopeRef.current === scopeKey) {
        setIsLoading(false);
      }
    }
  }, [convex, scope.companyId, scope.projectId, scopeKey]);

  useEffect(() => {
    activeScopeRef.current = scopeKey;
    if (!scopeKey) {
      setSummary(null);
      setIsLoading(false);
      return;
    }
    void fetchSummary();
  }, [scopeKey, fetchSummary]);

  return { summary, isLoading, refetch: fetchSummary };
}
