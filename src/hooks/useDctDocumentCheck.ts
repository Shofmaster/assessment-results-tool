/**
 * Document-check orchestration for the DCT Compliance view.
 *
 * Owns the document-check session state (scope/notes/verdict/findings), the
 * run progress indicator, the latest-session hydrate effect, and the
 * run/save/complete handlers. The batch loop itself runs client-side via
 * {@link runDctDocumentCheckBatch}, which calls the Claude proxy in capped
 * batches.
 *
 * Spend-safety invariants (values centralized in {@link ../utils/dctSpendLimits}):
 *   - Company docs are capped at {@link DCT_MAX_COMPANY_DOCS}.
 *   - Each doc's extracted text is capped at {@link DCT_MAX_DOC_TEXT_CHARS} chars
 *     and docs with fewer than {@link DCT_MIN_DOC_TEXT_CHARS} chars are skipped
 *     (no point sending near-empty docs to the model).
 *   - The batch engine runs {@link DCT_DOCUMENT_CHECK_BATCH_SIZE} questions per
 *     API call.
 *   - Rate-limit hits surface a single coalesced toast and rely on the engine's
 *     own backoff — there is no extra client retry loop.
 */
import { useEffect, useMemo, useState } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import {
  useCreateDctDocumentCheck,
  useDctBulkApplyTraceability,
  useUpdateDctDocumentCheck,
} from './useConvexData';
import { parallelMap } from '../services/dctIngestChunks';
import { runDctDocumentCheckBatch } from '../services/dctDocumentCheckEngine';
import { ClaudeRateLimitError } from '../services/claudeProxy';
import { getDctDocumentCheckSystemPrompt } from '../services/auditAgents';
import { resolveExtractedTextForConvexDoc } from '../utils/documentExtractedText';
import {
  DCT_MAX_COMPANY_DOCS,
  DCT_MAX_DOC_TEXT_CHARS,
  DCT_MIN_DOC_TEXT_CHARS,
  DCT_DOCUMENT_CHECK_BATCH_SIZE,
  DCT_DOC_TEXT_RESOLVE_CONCURRENCY,
} from '../utils/dctSpendLimits';
import {
  countFindingSeverities,
  summarizeDocumentCheckResults,
  type DctCheckVerdict,
  type DocumentCheckFinding,
} from '../utils/dctCompliancePresenter';
import type { Id } from '../../convex/_generated/dataModel';

export interface UseDctDocumentCheckParams {
  activeProjectId: string | null | undefined;
  enriched: any[] | undefined;
  mergedCompanyDocs: any[];
  defaultRunSelection: Set<string>;
  documentChecks: any[] | undefined;
  documentCheckModel: string;
  /** Effective document-check perspective agent id (store value validated by the caller). */
  documentCheckAgentId: string;
  /** Record the comparison-id set that was submitted for a run (shared dialog state). */
  onSelectionSubmitted: (selection: Set<string>) => void;
}

export function useDctDocumentCheck({
  activeProjectId,
  enriched,
  mergedCompanyDocs,
  defaultRunSelection,
  documentChecks,
  documentCheckModel,
  documentCheckAgentId,
  onSelectionSubmitted,
}: UseDctDocumentCheckParams) {
  const convex = useConvex();
  const bulkTrace = useDctBulkApplyTraceability();
  const createDocumentCheck = useCreateDctDocumentCheck();
  const updateDocumentCheck = useUpdateDctDocumentCheck();

  const [documentCheckRunning, setDocumentCheckRunning] = useState(false);
  const [documentCheckScope, setDocumentCheckScope] = useState('');
  const [documentCheckNotes, setDocumentCheckNotes] = useState('');
  const [documentCheckVerdict, setDocumentCheckVerdict] = useState<DctCheckVerdict>('pending');
  const [documentCheckFindings, setDocumentCheckFindings] = useState<DocumentCheckFinding[]>([]);
  const [documentCheckProgress, setDocumentCheckProgress] = useState<{
    processed: number;
    total: number;
  }>({ processed: 0, total: 0 });
  const [activeDocumentCheckId, setActiveDocumentCheckId] = useState<string | null>(null);

  const documentCheckSeverityCounts = useMemo(
    () => countFindingSeverities(documentCheckFindings),
    [documentCheckFindings],
  );

  const documentCheckButtonLabel = documentCheckRunning
    ? documentCheckProgress.total > 0
      ? `Checking… ${documentCheckProgress.processed}/${documentCheckProgress.total}`
      : 'Checking…'
    : defaultRunSelection.size > 0
      ? `Check ${defaultRunSelection.size} item${defaultRunSelection.size === 1 ? '' : 's'}`
      : 'Check documents';

  /**
   * Hydrate the editor from the most recent saved document-check session once
   * per project load (only while nothing is already loaded), so reopening the
   * tab shows the last session instead of an empty form.
   */
  useEffect(() => {
    if (!documentChecks?.length) return;
    if (activeDocumentCheckId) return;
    const latest = documentChecks[0];
    setActiveDocumentCheckId(String(latest._id));
    setDocumentCheckScope(latest.scope ?? '');
    setDocumentCheckNotes(latest.notes ?? '');
    setDocumentCheckVerdict((latest.verdict as DctCheckVerdict | undefined) ?? 'pending');
    setDocumentCheckFindings(
      Array.isArray(latest.findings) ? (latest.findings as DocumentCheckFinding[]) : [],
    );
  }, [documentChecks, activeDocumentCheckId]);

  /**
   * Direct-run document check on the auto-selected applicable+unsure set.
   * Users who want to hand-pick can open the modal via "Customize selection…".
   */
  const handleRunDocumentCheck = () => {
    if (!activeProjectId) return;
    if (!enriched?.length) {
      toast.error('Use Sync from library to copy DCT requirements into this project first.');
      return;
    }
    if (!mergedCompanyDocs.length) {
      toast.error('Add entity/regulatory manuals with extracted text to the project first.');
      return;
    }
    if (defaultRunSelection.size === 0) {
      toast.error('No applicable rows. Adjust Settings or toggle "Show all DCTs".');
      return;
    }
    onSelectionSubmitted(new Set(defaultRunSelection));
    void executeDocumentCheck(defaultRunSelection);
  };

  /** Runs document check against the user-confirmed comparisonIds from the Run Selection dialog. */
  const executeDocumentCheck = async (selectedIds: Set<string>) => {
    if (!activeProjectId) return;
    const selectedRows = (enriched ?? []).filter((row) =>
      selectedIds.has(String(row.comparison._id)),
    );
    if (!selectedRows.length) {
      toast.error('No DCT questions selected.');
      return;
    }
    if (!mergedCompanyDocs.length) {
      toast.error('Add entity/regulatory manuals with extracted text to the project first.');
      return;
    }

    setDocumentCheckRunning(true);
    setDocumentCheckProgress({ processed: 0, total: selectedRows.length });
    const startedAt = new Date().toISOString();
    let checkId: Id<'dctDocumentChecks'> | null = null;

    try {
      checkId = (await createDocumentCheck({
        projectId: activeProjectId as Id<'projects'>,
        status: 'running',
        verdict: 'pending',
        // Persist explicit clears so blank inputs remain blank after refresh/reload.
        scope: documentCheckScope.trim(),
        notes: documentCheckNotes.trim(),
        perspectiveAgentId: documentCheckAgentId,
        model: documentCheckModel,
        startedAt,
      })) as Id<'dctDocumentChecks'>;

      setActiveDocumentCheckId(String(checkId));

      const docSlice = mergedCompanyDocs.slice(0, DCT_MAX_COMPANY_DOCS);
      const resolved = await parallelMap(docSlice, DCT_DOC_TEXT_RESOLVE_CONCURRENCY, async (d: any) => {
        const text = await resolveExtractedTextForConvexDoc(
          {
            _id: String(d._id),
            name: d.name,
            extractedText: d.extractedText,
            extractedTextStorageId: d.extractedTextStorageId,
          },
          convex,
        );
        return { d, text: (text ?? '').trim() };
      });

      const docsForAi: { id: string; name: string; category?: string; text: string }[] = [];
      for (const { d, text: t } of resolved) {
        if (t.length < DCT_MIN_DOC_TEXT_CHARS) continue;
        docsForAi.push({
          id: String(d._id),
          name: d.name ?? 'Document',
          category: d.category,
          text: t.slice(0, DCT_MAX_DOC_TEXT_CHARS),
        });
      }
      if (!docsForAi.length) {
        toast.error('No document extracted text found (extract manuals first).');
        return;
      }

      const questions = selectedRows.map((row) => ({
        comparisonId: String(row.comparison._id),
        questionText: row.question.text ?? '',
        dctFileName: row.dctDocument.fileName,
        questionReferences: (row.question.references ?? []).map((r: any) => r.label),
      }));

      let dcRateLimitToastId: string | number | undefined;
      const resultRows = await runDctDocumentCheckBatch(documentCheckModel, docsForAi, questions, {
        batchSize: DCT_DOCUMENT_CHECK_BATCH_SIZE,
        systemPrompt: getDctDocumentCheckSystemPrompt(documentCheckAgentId),
        onBatchProgress: (processed, total) => setDocumentCheckProgress({ processed, total }),
        onRateLimit: ({ batchIndex, waitMs }) => {
          const seconds = Math.max(1, Math.round(waitMs / 1000));
          const msg =
            waitMs > 0
              ? `Anthropic rate limit hit on batch ${batchIndex + 1} — waiting ${seconds}s before retrying.`
              : `Anthropic rate limit hit on batch ${batchIndex + 1} — retrying with backoff.`;
          if (dcRateLimitToastId === undefined) {
            dcRateLimitToastId = toast.loading(msg);
          } else {
            toast.loading(msg, { id: dcRateLimitToastId });
          }
        },
      });
      if (dcRateLimitToastId !== undefined) toast.dismiss(dcRateLimitToastId);
      if (!resultRows.length) {
        toast.error('No AI results returned. Try again or check API logs.');
        return;
      }

      const { findings, severityTotals, statusTotals, verdict: nextVerdict } =
        summarizeDocumentCheckResults(selectedRows, resultRows);

      setDocumentCheckFindings(findings);
      setDocumentCheckVerdict(nextVerdict);
      await bulkTrace({
        projectId: activeProjectId as Id<'projects'>,
        results: findings.map((f) => ({
          comparisonId: f.comparisonId as Id<'dctComparisons'>,
          status: f.status,
          underReviewDocumentId: f.underReviewDocumentId as Id<'documents'> | undefined,
          evidenceSnippet: f.evidenceSnippet,
          rationale: f.rationale,
          severity: f.severity,
        })),
      });

      await updateDocumentCheck({
        checkId: checkId as Id<'dctDocumentChecks'>,
        status: 'completed',
        verdict: nextVerdict,
        findings,
        totals: {
          questions: findings.length,
          critical: severityTotals.critical,
          major: severityTotals.major,
          minor: severityTotals.minor,
          observation: severityTotals.observation,
          aligned: statusTotals.aligned,
          gap: statusTotals.gap,
          mismatch: statusTotals.mismatch,
          pending: statusTotals.pending,
        },
        completedAt: new Date().toISOString(),
      });
      toast.success(`Document check completed for ${findings.length} applicable DCT requirement(s).`);
    } catch (e: any) {
      if (checkId) {
        await updateDocumentCheck({
          checkId,
          status: 'failed',
          verdict: 'fail',
          findings: documentCheckFindings,
          completedAt: new Date().toISOString(),
        });
      }
      if (e instanceof ClaudeRateLimitError) {
        const seconds = e.retryAfterMs ? Math.round(e.retryAfterMs / 1000) : undefined;
        toast.error(
          seconds
            ? `Anthropic rate limit exceeded. Please wait about ${seconds}s and try again, or run a smaller batch.`
            : 'Anthropic rate limit exceeded. Please wait a moment and try again, or run a smaller batch.',
        );
      } else {
        toast.error(e?.message ?? 'Document check failed');
      }
    } finally {
      setDocumentCheckRunning(false);
    }
  };

  const handleSaveDocumentCheck = async () => {
    if (!activeDocumentCheckId) {
      toast.error('Run a document check first.');
      return;
    }
    await updateDocumentCheck({
      checkId: activeDocumentCheckId as Id<'dctDocumentChecks'>,
      verdict: documentCheckVerdict,
      // Persist explicit clears so blank inputs remain blank after save.
      scope: documentCheckScope.trim(),
      notes: documentCheckNotes.trim(),
      findings: documentCheckFindings,
    });
    toast.success('Document check session saved.');
  };

  const handleCompleteDocumentCheck = async () => {
    if (!activeDocumentCheckId) {
      toast.error('Run a document check first.');
      return;
    }
    await updateDocumentCheck({
      checkId: activeDocumentCheckId as Id<'dctDocumentChecks'>,
      status: 'completed',
      verdict: documentCheckVerdict,
      findings: documentCheckFindings,
      completedAt: new Date().toISOString(),
    });
    toast.success('Document check completed.');
  };

  return {
    documentCheckRunning,
    documentCheckScope,
    setDocumentCheckScope,
    documentCheckNotes,
    setDocumentCheckNotes,
    documentCheckVerdict,
    setDocumentCheckVerdict,
    documentCheckFindings,
    setDocumentCheckFindings,
    documentCheckProgress,
    activeDocumentCheckId,
    setActiveDocumentCheckId,
    documentCheckSeverityCounts,
    documentCheckButtonLabel,
    handleRunDocumentCheck,
    executeDocumentCheck,
    handleSaveDocumentCheck,
    handleCompleteDocumentCheck,
  };
}
