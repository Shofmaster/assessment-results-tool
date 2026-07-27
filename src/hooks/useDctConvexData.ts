import { useMemo } from 'react';
import { useMutation, useAction } from 'convex/react';
import { useQuery } from './useConvexQueryNoThrow';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';

// --- DCT Compliance (FAA SAS DCT traceability) ---------------------------
export function useDctComplianceSummary(projectId: string | undefined) {
  return useQuery(
    api.dctCompliance.getSummary,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

/** Full-project DCT metrics (status, applicability, open findings) — same source as summary.metrics. */
export function useDctProjectMetrics(projectId: string | undefined) {
  return useQuery(
    api.dctCompliance.getProjectMetrics,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

export function useDctToolDocuments(projectId: string | undefined) {
  return useQuery(
    api.dctCompliance.listToolDocuments,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

export function useDctParsedLibraryDocsByCompany(companyId: string | undefined) {
  return useQuery(
    api.dctCompliance.listParsedLibraryDocsByCompany,
    companyId ? { companyId: companyId as Id<'companies'> } : 'skip',
  );
}

/**
 * Enriched DCT comparison rows. The server ships a normalized payload
 * (comparisons + each question/DCT document once); this hook reassembles the
 * `{comparison, question, dctDocument}` rows consumers expect and sorts them
 * by file → displayOrder → question text (the order the server used to apply).
 * Returns `{ rows, truncated } | undefined` — `truncated` is true when the
 * project has more comparisons than the server row cap.
 */
export function useDctComparisonsEnriched(projectId: string | undefined) {
  const raw = useQuery(
    api.dctCompliance.listComparisonsEnriched,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  ) as
    | { comparisons: any[]; questions: any[]; documents: any[]; truncated: boolean }
    | undefined;
  return useMemo(() => {
    if (raw === undefined) return undefined;
    const questionsById = new Map<string, any>(raw.questions.map((q) => [String(q._id), q]));
    const documentsById = new Map<string, any>(raw.documents.map((d) => [String(d._id), d]));
    const rows: Array<{ comparison: any; question: any; dctDocument: any }> = [];
    for (const comparison of raw.comparisons) {
      const question = questionsById.get(String(comparison.questionId));
      if (!question) continue;
      const dctDocument = documentsById.get(String(question.dctDocumentId));
      if (!dctDocument) continue;
      rows.push({ comparison, question, dctDocument });
    }
    rows.sort((a, b) => {
      const fa = a.dctDocument.fileName ?? '';
      const fb = b.dctDocument.fileName ?? '';
      if (fa !== fb) return fa.localeCompare(fb);
      const oa = a.question.displayOrder ?? 0;
      const ob = b.question.displayOrder ?? 0;
      if (oa !== ob) return oa - ob;
      return String(a.question.text ?? '').localeCompare(String(b.question.text ?? ''));
    });
    return { rows, truncated: raw.truncated === true };
  }, [raw]);
}

/** Metadata-only manual-corpus docs for the DCT page (no extractedText shipped). */
export function useDctCorpusDocMeta(projectId: string | undefined) {
  return useQuery(
    api.dctCompliance.listCorpusDocMeta,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

/**
 * Server-truncated manual corpus for the applicability toggle. Pass
 * `enabled: false` (toggle off — the default) to skip the subscription so the
 * page never reads manual text it won't use.
 */
export function useDctManualApplicabilityCorpus(
  projectId: string | undefined,
  enabled: boolean,
) {
  return useQuery(
    api.dctCompliance.getManualApplicabilityCorpus,
    enabled && projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  ) as string | undefined;
}

export function useDctRevisionChecks(projectId: string | undefined, limit?: number) {
  return useQuery(
    api.dctCompliance.listRevisionChecks,
    projectId ? { projectId: projectId as Id<'projects'>, limit } : 'skip',
  );
}

export function useDctReports(projectId: string | undefined, limit?: number) {
  return useQuery(
    api.dctCompliance.listReports,
    projectId ? { projectId: projectId as Id<'projects'>, limit } : 'skip',
  );
}

export function useDctDocumentChecks(projectId: string | undefined, limit?: number) {
  return useQuery(
    api.dctDocumentChecks.listByProject,
    projectId ? { projectId: projectId as Id<'projects'>, limit } : 'skip',
  );
}

export function useDctDocumentCheck(checkId: string | undefined) {
  return useQuery(
    api.dctDocumentChecks.get,
    checkId ? { checkId: checkId as Id<'dctDocumentChecks'> } : 'skip',
  );
}

export function useDctUpsertSettings() {
  return useMutation(api.dctCompliance.upsertSettings);
}

export function useDctIngestFromParsedLibrary() {
  return useMutation(api.dctCompliance.ingestFromParsedLibrary);
}

export function useDctUpdateComparison() {
  return useMutation(api.dctCompliance.updateComparison);
}

export function useDctBulkApplyTraceability() {
  return useMutation(api.dctCompliance.bulkApplyTraceabilityResults);
}

export function useDctRefreshApplicability() {
  return useMutation(api.dctCompliance.refreshApplicability);
}

export function useDctBulkSetMatrixFields() {
  return useMutation(api.dctCompliance.bulkSetMatrixFields);
}

/**
 * Kick off a server-orchestrated traceability run. The action runs to
 * completion on Convex so closing the tab doesn't abort it; the UI watches
 * progress through `useActiveTraceabilityRun`.
 */
export function useStartTraceabilityRun() {
  return useAction(api.dctTraceabilityRunner.startTraceabilityRun);
}

export function useActiveTraceabilityRun(projectId: string | undefined) {
  return useQuery(
    api.dctCompliance.getActiveTraceabilityRun,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

export function useCancelTraceabilityRun() {
  return useMutation(api.dctCompliance.cancelTraceabilityRun);
}

export function useResumeTraceabilityRun() {
  return useMutation(api.dctCompliance.resumeTraceabilityRun);
}

/** Cancel every in-flight traceability run for the signed-in user (used on logout). */
export function useCancelAllActiveRuns() {
  return useMutation(
    api.dctCompliance.cancelActiveTraceabilityRunsForUser,
  );
}

export function useDctCompleteScheduledCheck() {
  return useMutation(api.dctCompliance.completeScheduledCheck);
}

export function useDctCreateReport() {
  return useMutation(api.dctCompliance.createReport);
}

export function useCreateDctDocumentCheck() {
  return useMutation(api.dctDocumentChecks.create);
}

export function useUpdateDctDocumentCheck() {
  return useMutation(api.dctDocumentChecks.update);
}

