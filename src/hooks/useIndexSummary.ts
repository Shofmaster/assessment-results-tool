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

export function useIndexSummary(projectId: Id<'projects'> | null | undefined): UseIndexSummaryResult {
  const convex = useConvex();
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeProjectRef = useRef<string | null>(null);

  const fetchSummary = useCallback(async (): Promise<void> => {
    if (!projectId) {
      setSummary(null);
      return;
    }
    setIsLoading(true);
    try {
      const result = (await convex.action((api as any).documentChunks.indexSummary, {
        projectId,
      })) as IndexSummary;
      if (activeProjectRef.current === String(projectId)) {
        setSummary(result);
      }
    } catch {
      if (activeProjectRef.current === String(projectId)) {
        setSummary(null);
      }
    } finally {
      if (activeProjectRef.current === String(projectId)) {
        setIsLoading(false);
      }
    }
  }, [convex, projectId]);

  useEffect(() => {
    activeProjectRef.current = projectId ? String(projectId) : null;
    if (!projectId) {
      setSummary(null);
      setIsLoading(false);
      return;
    }
    void fetchSummary();
  }, [projectId, fetchSummary]);

  return { summary, isLoading, refetch: fetchSummary };
}
