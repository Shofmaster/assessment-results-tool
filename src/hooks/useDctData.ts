/**
 * Data-orchestration hook for the DCT Compliance view.
 *
 * Owns every Convex *read* query the view needs plus the data-only derived
 * memos (applicability classification of enriched rows, file summaries, finding
 * queues, status breakdown, run-selection rows, etc.). It performs no writes and
 * no LLM/API calls — those stay with the orchestration hooks/handlers in the
 * component (traceability run + document check), which is where token/spend
 * budgeting lives.
 *
 * Classification depends on a few pieces of *local UI state* (whether the manual
 * corpus is used, and the selected class-rating / capability ids). Those are
 * passed in as params so the hook stays a pure function of (queries + that
 * state) and classification output is byte-for-byte identical to the previous
 * inline memos.
 *
 * All hooks here are called unconditionally so the Rules of Hooks hold when the
 * consumer guards *after* calling this hook (the established pattern).
 */
import { useMemo } from 'react';
import {
  useActiveTraceabilityRun,
  useCapabilityListByCompany,
  useCapabilityListByProject,
  useClassRatingsByCompany,
  useClassRatingsByProject,
  useDctComparisonsEnriched,
  useDctComplianceSummary,
  useDctDocumentChecks,
  useDctReports,
  useDctRevisionChecks,
  useDctToolDocuments,
  useDocuments,
  useDocumentsByCompany,
  useIsFeatureEnabled,
  useOpSpecsByCompany,
  useProject,
  useSharedReferenceDocsResolved,
} from './useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import {
  inferApplicabilityTokensFromManualCorpus,
  MAX_MANUAL_CORPUS_CHARS,
  type DctApplicabilityState,
  type StructuredApplicabilityInput,
} from '../utils/dctApplicability';
import {
  classifyRow,
  countApplicabilityBuckets,
  deriveStatusBreakdown,
  type DctClassifyContext,
} from '../utils/dctCompliancePresenter';
import type { DctRunSelectionRow } from '../components/dct/DctRunSelectionDialog';
import type { DctEnrichedRow } from '../components/dct/types';
import type { Id } from '../../convex/_generated/dataModel';

export interface UseDctDataOptions {
  /** When true, manual-corpus-derived tokens are folded into classification. */
  useManualCorpusForApplicability: boolean;
  /** Class-rating ids the user has selected in Settings (id → checked). */
  selectedRatingIds: Record<string, boolean>;
  /** Capability ids the user has selected in Settings (id → checked). */
  selectedCapabilityIds: Record<string, boolean>;
}

export type ActiveTraceabilityRun =
  | {
      _id: string;
      status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
      total: number;
      processed: number;
      persisted: number;
      persistFailed: number;
      parseFailed: number;
      startedAt: string;
      lastHeartbeatAt?: string;
      completedAt?: string;
      cancelRequested?: boolean;
      error?: string;
    }
  | null
  | undefined;

export function useDctData(
  activeProjectId: string | null | undefined,
  { useManualCorpusForApplicability, selectedRatingIds, selectedCapabilityIds }: UseDctDataOptions,
) {
  const project = useProject(activeProjectId ?? undefined) as any;
  const companyId = project?.companyId as Id<'companies'> | undefined;

  const enabled = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const summary = useDctComplianceSummary(activeProjectId ?? undefined) as any;
  const enriched = useDctComparisonsEnriched(activeProjectId ?? undefined) as
    | DctEnrichedRow[]
    | undefined;
  const revisions = useDctRevisionChecks(activeProjectId ?? undefined, 25) as any[] | undefined;
  const reports = useDctReports(activeProjectId ?? undefined, 15) as any[] | undefined;
  const toolDocuments = useDctToolDocuments(activeProjectId ?? undefined) as any[] | undefined;
  const sharedRefsResolved = useSharedReferenceDocsResolved() as any[] | undefined;
  const dctSharedRefs = useMemo(
    () =>
      (sharedRefsResolved ?? []).filter((ref) => {
        const type = String(ref?.documentType ?? '').toLowerCase();
        const canonicalType = String(ref?.canonicalDocType ?? '').toLowerCase();
        return type === 'faa_sas_dct' || canonicalType === 'faa_sas_dct';
      }),
    [sharedRefsResolved],
  );

  const documentChecks = useDctDocumentChecks(activeProjectId ?? undefined, 25) as
    | any[]
    | undefined;
  const activeTraceabilityRun = useActiveTraceabilityRun(
    activeProjectId ?? undefined,
  ) as ActiveTraceabilityRun;

  const entity = useDocuments(activeProjectId ?? undefined, 'entity') as any[] | undefined;
  const regulatory = useDocuments(activeProjectId ?? undefined, 'regulatory') as any[] | undefined;
  const sms = useDocuments(activeProjectId ?? undefined, 'sms') as any[] | undefined;
  const uploaded = useDocuments(activeProjectId ?? undefined, 'uploaded') as any[] | undefined;
  const coEntity = useDocumentsByCompany(companyId ? String(companyId) : undefined, 'entity') as any[] | undefined;
  const coReg = useDocumentsByCompany(companyId ? String(companyId) : undefined, 'regulatory') as any[] | undefined;
  const classRatings = useClassRatingsByProject(activeProjectId ?? undefined) as any[] | undefined;
  const coClassRatings = useClassRatingsByCompany(companyId ? String(companyId) : undefined) as any[] | undefined;
  const capabilityItems = useCapabilityListByProject(activeProjectId ?? undefined) as any[] | undefined;
  const coCapabilityItems = useCapabilityListByCompany(companyId ? String(companyId) : undefined) as any[] | undefined;
  const coOpSpecs = useOpSpecsByCompany(companyId ? String(companyId) : undefined) as any[] | undefined;

  const allClassRatings = useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const r of [...(classRatings ?? []), ...(coClassRatings ?? [])]) {
      if (!seen.has(String(r._id))) { seen.add(String(r._id)); merged.push(r); }
    }
    return merged;
  }, [classRatings, coClassRatings]);

  const allCapabilityItems = useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const r of [...(capabilityItems ?? []), ...(coCapabilityItems ?? [])]) {
      if (!seen.has(String(r._id))) { seen.add(String(r._id)); merged.push(r); }
    }
    return merged;
  }, [capabilityItems, coCapabilityItems]);

  const dctLibraryRefsWithFile = useMemo(
    () =>
      (dctSharedRefs ?? []).filter(
        (r: any) =>
          r?.storageId &&
          typeof r?.contentHash === 'string' &&
          String(r.contentHash).trim().length > 0,
      ),
    [dctSharedRefs],
  );

  const ingestedContentHashes = useMemo(() => {
    const s = new Set<string>();
    for (const d of toolDocuments ?? []) {
      const h = d?.contentHash;
      if (typeof h === 'string' && h.trim()) s.add(h.trim());
    }
    return s;
  }, [toolDocuments]);

  const newLibraryHashesAvailable = useMemo(() => {
    let n = 0;
    for (const r of dctLibraryRefsWithFile) {
      const h = String(r.contentHash).trim();
      if (!ingestedContentHashes.has(h)) n++;
    }
    return n;
  }, [dctLibraryRefsWithFile, ingestedContentHashes]);

  const settings = summary?.settings;
  const profile = summary?.profile;

  const applicabilitySettings = useMemo(
    () => ({
      showAllDcts: settings?.showAllDcts === true,
      includedPeerGroupSubstrings: settings?.includedPeerGroupSubstrings,
      excludedPeerGroupSubstrings: settings?.excludedPeerGroupSubstrings,
      applicabilityMode: settings?.applicabilityMode,
    }),
    [settings],
  );

  const structuredApplicability = useMemo<StructuredApplicabilityInput>(
    () => ({
      selectedRatings: (allClassRatings ?? [])
        .filter((row) => selectedRatingIds[String(row._id)])
        .map((row) => ({
          ...row,
          authority: row.authority ?? "faa",
        })),
      selectedCapabilities: (allCapabilityItems ?? [])
        .filter((row) => selectedCapabilityIds[String(row._id)])
        .map((row) => ({
          ...row,
          authority: row.authority ?? "faa",
        })),
    }),
    [allClassRatings, allCapabilityItems, selectedRatingIds, selectedCapabilityIds],
  );

  const mergedCompanyDocs = useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const d of [...(entity ?? []), ...(regulatory ?? []), ...(sms ?? []), ...(uploaded ?? []), ...(coEntity ?? []), ...(coReg ?? [])]) {
      if (!d?._id || seen.has(String(d._id))) continue;
      seen.add(String(d._id));
      out.push(d);
    }
    return out;
  }, [entity, regulatory, sms, uploaded, coEntity, coReg]);

  const manualCorpusInline = useMemo(() => {
    const parts: string[] = [];
    let n = 0;
    for (const d of mergedCompanyDocs) {
      const t = (d.extractedText ?? '').trim();
      if (!t) continue;
      const take = Math.min(t.length, 40_000);
      parts.push(t.slice(0, take));
      n += take;
      if (n >= MAX_MANUAL_CORPUS_CHARS) break;
    }
    return parts.join('\n\n');
  }, [mergedCompanyDocs]);

  const manualApplicabilityTokens = useMemo(
    () => inferApplicabilityTokensFromManualCorpus(manualCorpusInline),
    [manualCorpusInline],
  );

  const manualExtraTokens =
    useManualCorpusForApplicability && manualApplicabilityTokens.length > 0
      ? manualApplicabilityTokens
      : undefined;

  // Derive extra applicability tokens from active company opspecs so that,
  // e.g., A025 (digital signatures) influences DCT classification client-side.
  const opspecExtraTokens = useMemo(() => {
    const activeOpspecs = (coOpSpecs ?? []).filter((r: any) => r.isActive);
    if (activeOpspecs.length === 0) return undefined;
    const tokenSet = new Set<string>();
    for (const row of activeOpspecs) {
      if (row.paragraph) tokenSet.add(String(row.paragraph).toLowerCase());
      if (row.title) {
        const norm = String(row.title).toLowerCase();
        tokenSet.add(norm);
        for (const part of norm.split(/[,/()\n]/)) {
          const phrase = part
            .replace(/\band\b|\bthe\b|\bto\b|\buse\b|\ba\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (phrase.length > 4) tokenSet.add(phrase);
        }
      }
    }
    return tokenSet.size > 0 ? [...tokenSet] : undefined;
  }, [coOpSpecs]);

  const effectiveExtraTokens = useMemo(() => {
    const parts = [...(manualExtraTokens ?? []), ...(opspecExtraTokens ?? [])];
    return parts.length > 0 ? parts : undefined;
  }, [manualExtraTokens, opspecExtraTokens]);

  /** Bundled inputs for {@link classifyRow}; memoized so dependent memos re-run only when an input changes. */
  const classifyCtx = useMemo<DctClassifyContext>(
    () => ({
      profile,
      settings: applicabilitySettings,
      extraTokens: effectiveExtraTokens,
      structured: structuredApplicability,
    }),
    [profile, applicabilitySettings, effectiveExtraTokens, structuredApplicability],
  );

  const dctFileSummaries = useMemo(() => {
    const docs = toolDocuments ?? [];
    if (!docs.length) return [];
    const byDoc = new Map<
      string,
      { applicable: number; unsure: number; notApplicable: number; total: number }
    >();
    for (const d of docs) {
      byDoc.set(String(d._id), { applicable: 0, unsure: 0, notApplicable: 0, total: 0 });
    }
    for (const row of enriched ?? []) {
      const id = String(row.dctDocument._id);
      const bucket = byDoc.get(id);
      if (!bucket) continue;
      const applicability = classifyRow(row, classifyCtx).state;
      bucket.total += 1;
      if (applicability === 'applicable') bucket.applicable += 1;
      else if (applicability === 'unsure') bucket.unsure += 1;
      else if (applicability === 'not_applicable') bucket.notApplicable += 1;
    }
    return docs.map((doc: any) => ({
      doc,
      ...(byDoc.get(String(doc._id)) ?? {
        applicable: 0,
        unsure: 0,
        notApplicable: 0,
        total: 0,
      }),
    }));
  }, [toolDocuments, enriched, classifyCtx]);

  /** Resolve document-check findings to full DCT rows for context UI. */
  const enrichedByComparisonId = useMemo(() => {
    const m = new Map<string, DctEnrichedRow>();
    for (const row of enriched ?? []) {
      m.set(String(row.comparison._id), row);
    }
    return m;
  }, [enriched]);

  const findingsQueue = useMemo(() => {
    return (enriched ?? []).filter((r) => {
      if (r.comparison.resolved) return false;
      if (r.comparison.status !== 'gap' && r.comparison.status !== 'mismatch') return false;
      return classifyRow(r, classifyCtx).state !== 'not_applicable';
    });
  }, [enriched, classifyCtx]);

  const unsureRows = useMemo(
    () => (enriched ?? []).filter((r) => classifyRow(r, classifyCtx).state === 'unsure'),
    [enriched, classifyCtx],
  );

  const applicableRows = useMemo(
    () =>
      (enriched ?? []).filter((r) => {
        const applicability = classifyRow(r, classifyCtx).state;
        return applicability === 'applicable' || applicability === 'unsure';
      }),
    [enriched, classifyCtx],
  );

  /** Enriched rows with effective applicability + confidence computed once — used by run-selection dialog, status strip, and matrix badges. */
  const classifiedEnriched = useMemo(() => {
    return (enriched ?? []).map((row) => {
      const { state, confidence } = classifyRow(row, classifyCtx);
      return { row, applicability: state, confidence };
    });
  }, [enriched, classifyCtx]);

  /** Map: comparisonId → { effective applicability, whether DB already has a stored value, confidence }. */
  const classifiedByComparisonId = useMemo(() => {
    const m = new Map<
      string,
      { applicability: DctApplicabilityState; stored: boolean; inferredApplicability: DctApplicabilityState; confidence: number }
    >();
    for (const { row, applicability, confidence } of classifiedEnriched) {
      const stored =
        row.comparison.applicabilityState === 'applicable' ||
        row.comparison.applicabilityState === 'unsure' ||
        row.comparison.applicabilityState === 'not_applicable';
      m.set(String(row.comparison._id), {
        applicability,
        stored,
        inferredApplicability: applicability,
        confidence,
      });
    }
    return m;
  }, [classifiedEnriched]);

  const runSelectionRows: DctRunSelectionRow[] = useMemo(
    () =>
      classifiedEnriched.map(({ row, applicability, confidence }) => ({
        comparisonId: String(row.comparison._id),
        questionText: row.question?.text ?? '',
        dctFileName: row.dctDocument?.fileName,
        peerGroupLabel: row.dctDocument?.peerGroupLabel,
        mlfLabel: row.dctDocument?.mlfLabel,
        specialtyLabel: row.dctDocument?.specialtyLabel,
        applicability,
        confidence,
        references: (row.question?.references ?? [])
          .map((r) => r?.label)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      })),
    [classifiedEnriched],
  );

  const defaultRunSelection = useMemo(() => {
    const s = new Set<string>();
    for (const { row, applicability } of classifiedEnriched) {
      if (applicability === 'applicable' || applicability === 'unsure') {
        s.add(String(row.comparison._id));
      }
    }
    return s;
  }, [classifiedEnriched]);

  const applicabilityBucketCounts = useMemo(
    () => countApplicabilityBuckets(classifiedEnriched),
    [classifiedEnriched],
  );

  /** Full-project status counts from server (not truncated enriched slice). */
  const statusBreakdown = useMemo(() => deriveStatusBreakdown(summary), [summary]);

  return {
    // raw queries
    project,
    companyId,
    enabled,
    summary,
    enriched,
    revisions,
    reports,
    toolDocuments,
    dctSharedRefs,
    documentChecks,
    activeTraceabilityRun,
    coOpSpecs,
    // settings / profile derived from summary
    settings,
    profile,
    applicabilitySettings,
    structuredApplicability,
    // class ratings / capabilities
    allClassRatings,
    allCapabilityItems,
    // company docs + manual corpus
    mergedCompanyDocs,
    manualCorpusInline,
    manualApplicabilityTokens,
    opspecExtraTokens,
    effectiveExtraTokens,
    // library sync helpers
    dctLibraryRefsWithFile,
    ingestedContentHashes,
    newLibraryHashesAvailable,
    // classification context + derived rows
    classifyCtx,
    enrichedByComparisonId,
    dctFileSummaries,
    findingsQueue,
    unsureRows,
    applicableRows,
    classifiedEnriched,
    classifiedByComparisonId,
    runSelectionRows,
    defaultRunSelection,
    applicabilityBucketCounts,
    statusBreakdown,
  };
}
