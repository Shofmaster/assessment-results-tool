import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiEye,
  FiFileText,
  FiGrid,
  FiLayers,
  FiPlayCircle,
  FiRefreshCw,
  FiSettings,
  FiZap,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDctBulkApplyTraceability,
  useDctBulkSetMatrixFields,
  useDctCompleteScheduledCheck,
  useDctComparisonsEnriched,
  useDctCreateReport,
  useDctComplianceSummary,
  useDctIngestFromParsedLibrary,
  useDctReports,
  useDctDocumentChecks,
  useCreateDctDocumentCheck,
  useUpdateDctDocumentCheck,
  useDctRevisionChecks,
  useDctToolDocuments,
  useSharedReferenceDocsResolved,
  useDctUpsertSettings,
  useDctUpdateComparison,
  useDocuments,
  useDocumentsByCompany,
  useClassRatingsByProject,
  useCapabilityListByProject,
  useDctTraceabilityAgentId,
  useDctTraceabilityModel,
  useDctDocumentCheckAgentId,
  useDctDocumentCheckModel,
  useIsFeatureEnabled,
  useProject,
  useUpsertUserSettings,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { parallelMap } from '../services/dctIngestChunks';
import { runDctTraceabilityBatch } from '../services/dctTraceabilityEngine';
import { runDctDocumentCheckBatch, type DctFindingSeverity } from '../services/dctDocumentCheckEngine';
import { ClaudeRateLimitError } from '../services/claudeProxy';
import {
  AUDIT_AGENTS,
  DCT_TRACEABILITY_AGENT_IDS,
  getDctDocumentCheckSystemPrompt,
  getDctTraceabilitySystemPrompt,
} from '../services/auditAgents';
import {
  DctCompliancePdfGenerator,
  type DctComplianceReportForPdf,
} from '../services/dctCompliancePdfGenerator';
import {
  DctDocumentCheckPdfGenerator,
  type DctDocumentCheckFindingForPdf,
} from '../services/dctDocumentCheckPdfGenerator';
import { resolveExtractedTextForConvexDoc } from '../utils/documentExtractedText';
import {
  classifyDctApplicability,
  inferApplicabilityTokensFromManualCorpus,
  MAX_MANUAL_CORPUS_CHARS,
  type DctApplicabilityState,
  type StructuredApplicabilityInput,
} from '../utils/dctApplicability';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard } from './ui';
import {
  DctContextPill,
  DctDocumentSummary,
  DctReferencePills,
  dctRowSearchBlob,
  purposePreview,
} from './DctContextUi';
import DctRunSelectionDialog, { type DctRunSelectionRow } from './dct/DctRunSelectionDialog';
import { PageModelSelector } from './PageModelSelector';
import { getConvexErrorMessage } from '../utils/convexError';
import type { Id } from '../../convex/_generated/dataModel';

type TabKey = 'overview' | 'matrix' | 'findings' | 'document-check' | 'settings' | 'reports';
type DctCheckVerdict = 'pass' | 'conditional' | 'fail' | 'pending';

type DctDocumentCheckFinding = {
  comparisonId: string;
  questionText: string;
  dctFileName?: string;
  status: 'pending' | 'aligned' | 'gap' | 'mismatch';
  severity: DctFindingSeverity;
  evidenceSnippet?: string;
  rationale?: string;
  underReviewDocumentId?: string;
  humanStatus?: 'draft' | 'accepted' | 'needs_work';
};

function statusBadgeClass(status: string) {
  if (status === 'green') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40';
  if (status === 'yellow') return 'bg-amber-500/20 text-amber-100 border-amber-500/40';
  if (status === 'red') return 'bg-red-500/20 text-red-200 border-red-500/40';
  return 'bg-white/10 text-white/70 border-white/20';
}

function statusLabel(status: string) {
  if (status === 'green') return 'Compliant';
  if (status === 'yellow') return 'Review due';
  if (status === 'red') return 'Action needed';
  return 'Not started';
}

function verdictFromStatus(status: string): 'pass' | 'conditional' | 'fail' | 'pending' {
  if (status === 'green') return 'pass';
  if (status === 'yellow') return 'conditional';
  if (status === 'red') return 'fail';
  return 'pending';
}

function findingSeverityBadgeClass(severity: DctFindingSeverity): string {
  if (severity === 'critical') return 'bg-red-500/20 text-red-200 border-red-500/40';
  if (severity === 'major') return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  if (severity === 'minor') return 'bg-sky-500/20 text-sky-200 border-sky-500/40';
  return 'bg-white/10 text-white/70 border-white/20';
}

function sortFindingsBySeverity<T extends { severity: DctFindingSeverity }>(findings: T[]): T[] {
  const order: Record<DctFindingSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    observation: 3,
  };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

export default function DctCompliance() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusViewHeading(ref);
  const convex = useConvex();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const project = useProject(activeProjectId ?? undefined) as any;
  const companyId = project?.companyId as Id<'companies'> | undefined;

  const enabled = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const summary = useDctComplianceSummary(activeProjectId ?? undefined) as any;
  const enriched = useDctComparisonsEnriched(activeProjectId ?? undefined) as any[] | undefined;
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

  const ingestFromParsedLibrary = useDctIngestFromParsedLibrary();
  const upsertDctProjectSettings = useDctUpsertSettings();
  const upsertUserSettings = useUpsertUserSettings();
  const completeCheck = useDctCompleteScheduledCheck();
  const bulkTrace = useDctBulkApplyTraceability();
  const bulkSetMatrix = useDctBulkSetMatrixFields();
  const patchComparison = useDctUpdateComparison();
  const createReport = useDctCreateReport();
  const documentChecks = useDctDocumentChecks(activeProjectId ?? undefined, 25) as any[] | undefined;
  const createDocumentCheck = useCreateDctDocumentCheck();
  const updateDocumentCheck = useUpdateDctDocumentCheck();

  const entity = useDocuments(activeProjectId ?? undefined, 'entity') as any[] | undefined;
  const regulatory = useDocuments(activeProjectId ?? undefined, 'regulatory') as any[] | undefined;
  const sms = useDocuments(activeProjectId ?? undefined, 'sms') as any[] | undefined;
  const uploaded = useDocuments(activeProjectId ?? undefined, 'uploaded') as any[] | undefined;
  const coEntity = useDocumentsByCompany(companyId ? String(companyId) : undefined, 'entity') as any[] | undefined;
  const coReg = useDocumentsByCompany(companyId ? String(companyId) : undefined, 'regulatory') as any[] | undefined;
  const classRatings = useClassRatingsByProject(activeProjectId ?? undefined) as any[] | undefined;
  const capabilityItems = useCapabilityListByProject(activeProjectId ?? undefined) as any[] | undefined;

  const model = useDctTraceabilityModel();
  const documentCheckModel = useDctDocumentCheckModel();
  const validDctTraceabilityAgentIds = useMemo(
    () => new Set(DCT_TRACEABILITY_AGENT_IDS as readonly string[]),
    [],
  );
  const dctTraceabilityAgentIdFromStore = useDctTraceabilityAgentId();
  const dctDocumentCheckAgentIdFromStore = useDctDocumentCheckAgentId();
  const dctTraceabilityAgentId = validDctTraceabilityAgentIds.has(dctTraceabilityAgentIdFromStore)
    ? dctTraceabilityAgentIdFromStore
    : 'faa-dct-traceability';
  const dctDocumentCheckAgentId = validDctTraceabilityAgentIds.has(dctDocumentCheckAgentIdFromStore)
    ? dctDocumentCheckAgentIdFromStore
    : 'faa-dct-traceability';

  const [localDctTraceabilityAgentId, setLocalDctTraceabilityAgentId] = useState<string>(
    dctTraceabilityAgentId,
  );
  useEffect(() => {
    setLocalDctTraceabilityAgentId(dctTraceabilityAgentId);
  }, [dctTraceabilityAgentId]);
  const [localDctDocumentCheckAgentId, setLocalDctDocumentCheckAgentId] = useState<string>(
    dctDocumentCheckAgentId,
  );
  useEffect(() => {
    setLocalDctDocumentCheckAgentId(dctDocumentCheckAgentId);
  }, [dctDocumentCheckAgentId]);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [useManualCorpusForApplicability, setUseManualCorpusForApplicability] = useState(false);
  const [traceRunning, setTraceRunning] = useState(false);
  const [documentCheckRunning, setDocumentCheckRunning] = useState(false);
  const [documentCheckScope, setDocumentCheckScope] = useState('');
  const [documentCheckNotes, setDocumentCheckNotes] = useState('');
  const [documentCheckVerdict, setDocumentCheckVerdict] = useState<DctCheckVerdict>('pending');
  const [documentCheckFindings, setDocumentCheckFindings] = useState<DctDocumentCheckFinding[]>([]);
  const [documentCheckProgress, setDocumentCheckProgress] = useState<{ processed: number; total: number }>({
    processed: 0,
    total: 0,
  });
  /** Per-batch progress for an in-flight traceability run, so the UI isn't stuck on "Running…". */
  const [traceProgress, setTraceProgress] = useState<{ processed: number; total: number }>({
    processed: 0,
    total: 0,
  });
  const [activeDocumentCheckId, setActiveDocumentCheckId] = useState<string | null>(null);
  const [matrixFilter, setMatrixFilter] = useState('');
  const [matrixStatus, setMatrixStatus] = useState<string>('all');
  const [matrixApplicability, setMatrixApplicability] = useState<'all' | DctApplicabilityState>('all');
  /** When set, matrix shows only requirements from this ingested `dctToolDocuments` row. */
  const [matrixDocFilterId, setMatrixDocFilterId] = useState<string | null>(null);
  const [includeOverride, setIncludeOverride] = useState('');
  const [excludeOverride, setExcludeOverride] = useState('');
  const [selectedRatingIds, setSelectedRatingIds] = useState<Record<string, boolean>>({});
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<Record<string, boolean>>({});
  const [applicabilityMode, setApplicabilityMode] = useState<'heuristics_only' | 'structured_preferred'>('structured_preferred');
  const [runSelectionOpen, setRunSelectionOpen] = useState<null | 'traceability' | 'document-check'>(null);
  const [lastRunSelection, setLastRunSelection] = useState<Set<string>>(new Set());
  /** Comparison IDs explicitly checked in the traceability matrix for bulk actions. */
  const [matrixSelection, setMatrixSelection] = useState<Set<string>>(new Set());
  useEffect(() => {
    setMatrixSelection(new Set());
  }, [activeProjectId]);
  const [matrixBulkBusy, setMatrixBulkBusy] = useState(false);
  const [autoAcceptingApplicability, setAutoAcceptingApplicability] = useState(false);

  const settings = summary?.settings;

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

  useEffect(() => {
    if (!activeProjectId || !settings) return;
    setIncludeOverride((settings.includedPeerGroupSubstrings ?? []).join(', '));
    setExcludeOverride((settings.excludedPeerGroupSubstrings ?? []).join(', '));
    setApplicabilityMode((settings.applicabilityMode as 'heuristics_only' | 'structured_preferred' | undefined) ?? 'structured_preferred');
    const nextRatings: Record<string, boolean> = {};
    for (const id of settings.selectedClassRatingIds ?? []) nextRatings[String(id)] = true;
    setSelectedRatingIds(nextRatings);
    const nextCapabilities: Record<string, boolean> = {};
    for (const id of settings.selectedCapabilityIds ?? []) nextCapabilities[String(id)] = true;
    setSelectedCapabilityIds(nextCapabilities);
  }, [activeProjectId, settings?.updatedAt]);
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
      selectedRatings: (classRatings ?? [])
        .filter((row) => selectedRatingIds[String(row._id)])
        .map((row) => ({
          ...row,
          authority: row.authority ?? "faa",
        })),
      selectedCapabilities: (capabilityItems ?? [])
        .filter((row) => selectedCapabilityIds[String(row._id)])
        .map((row) => ({
          ...row,
          authority: row.authority ?? "faa",
        })),
    }),
    [classRatings, capabilityItems, selectedRatingIds, selectedCapabilityIds],
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

  const filteredRows = useMemo(() => {
    if (!enriched?.length) return [];
    const q = matrixFilter.trim().toLowerCase();
    return enriched.filter((row) => {
      const doc = row.dctDocument;
      if (matrixDocFilterId && String(doc._id) !== matrixDocFilterId) return false;
      const inferred = classifyDctApplicability(
        doc.peerGroupLabel,
        doc.mlfLabel,
        doc.specialtyLabel,
        profile,
        applicabilitySettings,
        manualExtraTokens,
        structuredApplicability,
      );
      const applicability = (row.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
      if (matrixApplicability !== 'all' && applicability !== matrixApplicability) return false;
      const st = row.comparison.status;
      if (matrixStatus !== 'all' && st !== matrixStatus) return false;
      if (!q) return true;
      const blob = `${dctRowSearchBlob(doc, row.question)} ${st} ${applicability}`;
      return blob.includes(q);
    });
  }, [
    enriched,
    matrixFilter,
    matrixStatus,
    matrixApplicability,
    matrixDocFilterId,
    profile,
    applicabilitySettings,
    manualExtraTokens,
    structuredApplicability,
  ]);

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
      const inferred = classifyDctApplicability(
        row.dctDocument.peerGroupLabel,
        row.dctDocument.mlfLabel,
        row.dctDocument.specialtyLabel,
        profile,
        applicabilitySettings,
        manualExtraTokens,
        structuredApplicability,
      );
      const applicability =
        (row.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
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
  }, [toolDocuments, enriched, profile, applicabilitySettings, manualExtraTokens, structuredApplicability]);

  /** Resolve document-check findings to full DCT rows for context UI. */
  const enrichedByComparisonId = useMemo(() => {
    const m = new Map<string, any>();
    for (const row of enriched ?? []) {
      m.set(String(row.comparison._id), row);
    }
    return m;
  }, [enriched]);

  const findingsQueue = useMemo(() => {
    return (enriched ?? []).filter((r) => {
      if (r.comparison.resolved) return false;
      if (r.comparison.status !== 'gap' && r.comparison.status !== 'mismatch') return false;
      const doc = r.dctDocument;
      const inferred = classifyDctApplicability(
        doc.peerGroupLabel,
        doc.mlfLabel,
        doc.specialtyLabel,
        profile,
        applicabilitySettings,
        manualExtraTokens,
        structuredApplicability,
      );
      const applicability = (r.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
      return applicability !== 'not_applicable';
    });
  }, [enriched, profile, applicabilitySettings, manualExtraTokens, structuredApplicability]);

  const unsureRows = useMemo(
    () =>
      (enriched ?? []).filter((r) => {
        const inferred = classifyDctApplicability(
          r.dctDocument.peerGroupLabel,
          r.dctDocument.mlfLabel,
          r.dctDocument.specialtyLabel,
          profile,
          applicabilitySettings,
          manualExtraTokens,
          structuredApplicability,
        );
        const applicability = (r.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
        return applicability === 'unsure';
      }),
    [enriched, profile, applicabilitySettings, manualExtraTokens, structuredApplicability],
  );

  const applicableRows = useMemo(
    () =>
      (enriched ?? []).filter((r) => {
        const inferred = classifyDctApplicability(
          r.dctDocument.peerGroupLabel,
          r.dctDocument.mlfLabel,
          r.dctDocument.specialtyLabel,
          profile,
          applicabilitySettings,
          manualExtraTokens,
          structuredApplicability,
        );
        const applicability = (r.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
        return applicability === 'applicable' || applicability === 'unsure';
      }),
    [enriched, profile, applicabilitySettings, manualExtraTokens, structuredApplicability],
  );

  /** Enriched rows with effective applicability + confidence computed once — used by run-selection dialog, status strip, and matrix badges. */
  const classifiedEnriched = useMemo(() => {
    return (enriched ?? []).map((row) => {
      const inferred = classifyDctApplicability(
        row.dctDocument.peerGroupLabel,
        row.dctDocument.mlfLabel,
        row.dctDocument.specialtyLabel,
        profile,
        applicabilitySettings,
        manualExtraTokens,
        structuredApplicability,
      );
      const applicability =
        (row.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
      return { row, applicability, confidence: inferred.confidence };
    });
  }, [enriched, profile, applicabilitySettings, manualExtraTokens, structuredApplicability]);

  /** Map: comparisonId → { effective applicability, whether DB already has a stored value }. */
  const classifiedByComparisonId = useMemo(() => {
    const m = new Map<
      string,
      { applicability: DctApplicabilityState; stored: boolean; inferredApplicability: DctApplicabilityState }
    >();
    for (const { row, applicability } of classifiedEnriched) {
      const stored =
        row.comparison.applicabilityState === 'applicable' ||
        row.comparison.applicabilityState === 'unsure' ||
        row.comparison.applicabilityState === 'not_applicable';
      m.set(String(row.comparison._id), {
        applicability,
        stored,
        inferredApplicability: applicability,
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
          .map((r: any) => r?.label)
          .filter((x: any): x is string => typeof x === 'string' && x.length > 0),
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

  const applicabilityBucketCounts = useMemo(() => {
    const out = { applicable: 0, unsure: 0, not_applicable: 0 };
    for (const { applicability } of classifiedEnriched) {
      out[applicability] += 1;
    }
    return out;
  }, [classifiedEnriched]);

  /** True when the current (structured) filter yields 0 applicable rows — shown as a banner in the dialog. */
  const fallbackBannerVisible =
    applicabilityBucketCounts.applicable === 0 && applicabilityBucketCounts.unsure > 0;

  const statusBreakdown = useMemo(() => {
    const out = { aligned: 0, gap: 0, mismatch: 0, pending: 0 };
    for (const r of enriched ?? []) {
      const s = r.comparison.status;
      if (s === 'aligned') out.aligned++;
      else if (s === 'gap') out.gap++;
      else if (s === 'mismatch') out.mismatch++;
      else out.pending++;
    }
    return out;
  }, [enriched]);

  const documentCheckSeverityCounts = useMemo(
    () =>
      documentCheckFindings.reduce(
        (acc, f) => {
          acc[f.severity] += 1;
          return acc;
        },
        { critical: 0, major: 0, minor: 0, observation: 0 },
      ),
    [documentCheckFindings],
  );

  /**
   * Button label for any "Run traceability" action. Shows per-question progress
   * while a run is in flight so the user can see forward motion instead of a
   * motionless "Running…".
   */
  const traceButtonLabel = traceRunning
    ? traceProgress.total > 0
      ? `Running… ${traceProgress.processed}/${traceProgress.total}`
      : 'Running…'
    : 'Run traceability';
  const tracePct =
    traceProgress.total > 0
      ? Math.min(100, Math.round((traceProgress.processed / traceProgress.total) * 100))
      : 0;

  useEffect(() => {
    if (!documentChecks?.length) return;
    if (activeDocumentCheckId) return;
    const latest = documentChecks[0];
    setActiveDocumentCheckId(String(latest._id));
    setDocumentCheckScope(latest.scope ?? '');
    setDocumentCheckNotes(latest.notes ?? '');
    setDocumentCheckVerdict((latest.verdict as DctCheckVerdict | undefined) ?? 'pending');
    setDocumentCheckFindings(Array.isArray(latest.findings) ? (latest.findings as DctDocumentCheckFinding[]) : []);
  }, [documentChecks, activeDocumentCheckId]);

  const handleSyncFromReferenceLibrary = async () => {
    if (!activeProjectId) {
      toast.error('Select a project first.');
      return;
    }
    if (!dctLibraryRefsWithFile.length) {
      toast.error('No shared DCT XML files in the reference library. Upload .xml in Entity Documents first.');
      return;
    }
    if (newLibraryHashesAvailable === 0) {
      toast.success('All library DCT files are already ingested into this project.');
      return;
    }
    setSyncingLibrary(true);
    const toastId = toast.loading('Copying parsed DCT requirements into this project…');
    try {
      const result = (await ingestFromParsedLibrary({
        projectId: activeProjectId as Id<'projects'>,
      })) as {
        ingestedDocs: number;
        skippedExisting: number;
        skippedNoCache: number;
        questionDelta: number;
      };
      const parts: string[] = [];
      if (result.skippedNoCache > 0) {
        parts.push(
          `${result.skippedNoCache} file(s) lack upload-time parse cache — re-upload those XML files in Entity Documents (DCT XML).`,
        );
      }
      toast.success(
        `Ingested ${result.ingestedDocs} DCT file(s) (${result.questionDelta} requirements).` +
          (result.skippedExisting ? ` Skipped ${result.skippedExisting} already in project.` : ''),
        {
          id: toastId,
          description: parts.length ? parts.join(' ') : undefined,
        },
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sync from library failed', { id: toastId });
    } finally {
      setSyncingLibrary(false);
    }
  };

  const handleSaveApplicability = async () => {
    if (!activeProjectId) return;
    const inc = includeOverride
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exc = excludeOverride
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await upsertDctProjectSettings({
      projectId: activeProjectId as Id<'projects'>,
      // Persist explicit clears so blank fields stay blank instead of rehydrating old values.
      includedPeerGroupSubstrings: inc,
      excludedPeerGroupSubstrings: exc,
      applicabilityMode,
      selectedClassRatingIds: Object.keys(selectedRatingIds).filter((id) => selectedRatingIds[id]) as any,
      selectedCapabilityIds: Object.keys(selectedCapabilityIds).filter((id) => selectedCapabilityIds[id]) as any,
    });
    toast.success('Applicability filters saved.');
  };

  /** Opens the Run Selection dialog for traceability after validating preconditions. */
  const handleRunTraceability = () => {
    if (!activeProjectId || !enriched?.length) {
      toast.error('Use Sync from library to copy DCT requirements into this project first.');
      return;
    }
    if (!mergedCompanyDocs.length) {
      toast.error('Add entity/regulatory manuals with extracted text to the project first.');
      return;
    }
    setRunSelectionOpen('traceability');
  };

  /** Runs traceability against the user-confirmed comparisonIds from the Run Selection dialog. */
  const executeTraceability = async (selectedIds: Set<string>) => {
    if (!activeProjectId || !enriched?.length) return;
    if (!mergedCompanyDocs.length) return;
    if (selectedIds.size === 0) {
      toast.error('No DCT questions selected.');
      return;
    }
    setTraceRunning(true);
    setTraceProgress({ processed: 0, total: selectedIds.size });
    try {
      const docSlice = mergedCompanyDocs.slice(0, 40);
      const resolved = await parallelMap(docSlice, 6, async (d: any) => {
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
        if (t.length < 80) continue;
        docsForAi.push({
          id: String(d._id),
          name: d.name ?? 'Document',
          category: d.category,
          text: t.slice(0, 50_000),
        });
      }
      if (!docsForAi.length) {
        toast.error('No document extracted text found (extract manuals first).');
        return;
      }
      const applicabilityByComparisonId = new Map<string, DctApplicabilityState>();
      for (const { row, applicability } of classifiedEnriched) {
        applicabilityByComparisonId.set(String(row.comparison._id), applicability);
      }
      const selectedRows = enriched.filter((row) => selectedIds.has(String(row.comparison._id)));
      const questions = selectedRows.map((row) => {
        const id = String(row.comparison._id);
        const eff = applicabilityByComparisonId.get(id) ?? 'applicable';
        const isUnsure = eff === 'unsure';
        return {
          comparisonId: id,
          questionText: isUnsure
            ? `[LOW CONFIDENCE APPLICABILITY] ${row.question.text}`
            : row.question.text,
          dctFileName: row.dctDocument.fileName,
          questionReferences: (row.question.references ?? []).map((r: any) => r.label),
          lowConfidenceApplicability: isUnsure,
        };
      });
      const lowConfidenceByComparisonId = new Map<string, boolean>(
        questions.map((q) => [q.comparisonId, q.lowConfidenceApplicability]),
      );
      if (!questions.length) {
        toast.error('No DCT questions selected.');
        return;
      }
      setTraceProgress({ processed: 0, total: questions.length });
      let rateLimitToastId: string | number | undefined;
      const results = await runDctTraceabilityBatch(model, docsForAi, questions, {
        batchSize: 10,
        systemPrompt: getDctTraceabilitySystemPrompt(localDctTraceabilityAgentId),
        onBatchProgress: (processed, total) => setTraceProgress({ processed, total }),
        onRateLimit: ({ batchIndex, waitMs }) => {
          const seconds = Math.max(1, Math.round(waitMs / 1000));
          const msg = waitMs > 0
            ? `Anthropic rate limit hit on batch ${batchIndex + 1} — waiting ${seconds}s before retrying.`
            : `Anthropic rate limit hit on batch ${batchIndex + 1} — retrying with backoff.`;
          if (rateLimitToastId === undefined) {
            rateLimitToastId = toast.loading(msg);
          } else {
            toast.loading(msg, { id: rateLimitToastId });
          }
        },
      });
      if (rateLimitToastId !== undefined) toast.dismiss(rateLimitToastId);
      if (!results.length) {
        toast.error('No AI results returned. Try again or check API logs.');
        return;
      }
      await bulkTrace({
        projectId: activeProjectId as Id<'projects'>,
        results: results.map((r) => {
          const eff = applicabilityByComparisonId.get(r.comparisonId) ?? 'applicable';
          return {
            comparisonId: r.comparisonId as Id<'dctComparisons'>,
            status: r.status,
            underReviewDocumentId: r.underReviewDocumentId as Id<'documents'> | undefined,
            evidenceSnippet: r.evidenceSnippet,
            rationale: r.rationale,
            lowConfidenceApplicability: lowConfidenceByComparisonId.get(r.comparisonId) === true,
            // Auto-accept the effective applicability on run so it persists
            // instead of re-inferring on every render.
            applicabilityState: eff,
            applicabilitySource: 'auto',
          };
        }),
      });
      toast.success(`Applied traceability to ${results.length} requirement(s).`);
    } catch (e: any) {
      if (e instanceof ClaudeRateLimitError) {
        const seconds = e.retryAfterMs ? Math.round(e.retryAfterMs / 1000) : undefined;
        toast.error(
          seconds
            ? `Anthropic rate limit exceeded. Please wait about ${seconds}s and try again, or run a smaller batch.`
            : 'Anthropic rate limit exceeded. Please wait a moment and try again, or run a smaller batch.',
        );
      } else {
        toast.error(e?.message ?? 'Traceability run failed');
      }
    } finally {
      setTraceRunning(false);
      setTraceProgress({ processed: 0, total: 0 });
    }
  };

  /** Opens the Run Selection dialog for document check after validating preconditions. */
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
    setRunSelectionOpen('document-check');
  };

  /** Runs document check against the user-confirmed comparisonIds from the Run Selection dialog. */
  const executeDocumentCheck = async (selectedIds: Set<string>) => {
    if (!activeProjectId) return;
    const selectedRows = (enriched ?? []).filter((row) => selectedIds.has(String(row.comparison._id)));
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
        perspectiveAgentId: localDctDocumentCheckAgentId,
        model: documentCheckModel,
        startedAt,
      })) as Id<'dctDocumentChecks'>;

      setActiveDocumentCheckId(String(checkId));

      const docSlice = mergedCompanyDocs.slice(0, 40);
      const resolved = await parallelMap(docSlice, 6, async (d: any) => {
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
        if (t.length < 80) continue;
        docsForAi.push({
          id: String(d._id),
          name: d.name ?? 'Document',
          category: d.category,
          text: t.slice(0, 50_000),
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
        batchSize: 10,
        systemPrompt: getDctDocumentCheckSystemPrompt(localDctDocumentCheckAgentId),
        onBatchProgress: (processed, total) => setDocumentCheckProgress({ processed, total }),
        onRateLimit: ({ batchIndex, waitMs }) => {
          const seconds = Math.max(1, Math.round(waitMs / 1000));
          const msg = waitMs > 0
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

      const byComparisonId = new Map(resultRows.map((r) => [r.comparisonId, r]));
      const findings = sortFindingsBySeverity(
        selectedRows
          .map((row) => {
            const ai = byComparisonId.get(String(row.comparison._id));
            if (!ai) return null;
            return {
              comparisonId: String(row.comparison._id),
              questionText: row.question.text ?? '',
              dctFileName: row.dctDocument.fileName,
              status: ai.status,
              severity: ai.severity,
              evidenceSnippet: ai.evidenceSnippet,
              rationale: ai.rationale,
              underReviewDocumentId: ai.underReviewDocumentId,
              humanStatus: 'draft' as const,
            };
          })
          .filter(Boolean) as DctDocumentCheckFinding[],
      );

      const severityTotals = findings.reduce(
        (acc, row) => {
          acc[row.severity] += 1;
          return acc;
        },
        { critical: 0, major: 0, minor: 0, observation: 0 },
      );
      const statusTotals = findings.reduce(
        (acc, row) => {
          acc[row.status] += 1;
          return acc;
        },
        { aligned: 0, gap: 0, mismatch: 0, pending: 0 },
      );
      const nextVerdict: DctCheckVerdict =
        severityTotals.critical > 0 ? 'fail' : statusTotals.gap + statusTotals.mismatch > 0 ? 'conditional' : 'pass';

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

  /**
   * Persist the heuristically-inferred applicability for every row whose DB
   * value is still unset. This is the "auto-accept applicable" action the
   * matrix toolbar exposes.
   */
  const handleAutoAcceptApplicability = async () => {
    if (!activeProjectId) {
      toast.error('Select a project first.');
      return;
    }
    const pending: Array<{ id: string; state: DctApplicabilityState }> = [];
    for (const { row, applicability } of classifiedEnriched) {
      const current = row.comparison.applicabilityState as
        | DctApplicabilityState
        | undefined;
      if (current !== 'applicable' && current !== 'unsure' && current !== 'not_applicable') {
        pending.push({ id: String(row.comparison._id), state: applicability });
      }
    }
    if (!pending.length) {
      toast.success('All DCT rows already have a stored applicability.');
      return;
    }
    setAutoAcceptingApplicability(true);
    try {
      // Group by target state to keep each mutation call small and atomic.
      const byState: Record<DctApplicabilityState, string[]> = {
        applicable: [],
        unsure: [],
        not_applicable: [],
      };
      for (const p of pending) byState[p.state].push(p.id);
      let applied = 0;
      for (const state of Object.keys(byState) as DctApplicabilityState[]) {
        const ids = byState[state];
        if (!ids.length) continue;
        // Convex mutation can handle large arrays; chunk to keep payloads sane.
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          const res = (await bulkSetMatrix({
            projectId: activeProjectId as Id<'projects'>,
            comparisonIds: slice as unknown as Id<'dctComparisons'>[],
            applicabilityState: state,
            applicabilitySource: 'auto',
          })) as { applied: number };
          applied += res?.applied ?? 0;
        }
      }
      toast.success(
        `Auto-accepted applicability on ${applied} DCT row${applied === 1 ? '' : 's'}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'Auto-accept failed');
    } finally {
      setAutoAcceptingApplicability(false);
    }
  };

  /** Bulk mutate every selected matrix row via `bulkSetMatrixFields`. */
  const bulkPatchSelected = async (
    patch: {
      applicabilityState?: DctApplicabilityState;
      status?: 'pending' | 'aligned' | 'gap' | 'mismatch';
      severity?: DctFindingSeverity;
      resolved?: boolean;
    },
    successMessage: string,
  ) => {
    if (!activeProjectId) return;
    if (matrixSelection.size === 0) {
      toast.error('Select one or more matrix rows first.');
      return;
    }
    setMatrixBulkBusy(true);
    try {
      const ids = Array.from(matrixSelection);
      let applied = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        const res = (await bulkSetMatrix({
          projectId: activeProjectId as Id<'projects'>,
          comparisonIds: slice as unknown as Id<'dctComparisons'>[],
          ...(patch.applicabilityState !== undefined
            ? {
                applicabilityState: patch.applicabilityState,
                applicabilitySource: 'user',
              }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
          ...(patch.resolved !== undefined ? { resolved: patch.resolved } : {}),
        })) as { applied: number };
        applied += res?.applied ?? 0;
      }
      toast.success(`${successMessage} (${applied} row${applied === 1 ? '' : 's'}).`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Bulk update failed');
    } finally {
      setMatrixBulkBusy(false);
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

  const buildReportPayload = useCallback((): DctComplianceReportForPdf | null => {
    if (!project?.name || !summary) return null;
    const st = String(summary.status ?? 'unknown').toUpperCase();
    const metrics = summary.comparisonStats ?? { total: 0, pending: 0 };
    const enrichedList = enriched ?? [];
    const { aligned, gap, mismatch, pending } = statusBreakdown;
    const unresolved = findingsQueue.length;
    const verdict = verdictFromStatus(summary.status);
    const conclusion =
      summary.status === 'green'
        ? 'Traceability review is current, no open DCT gaps or mismatches were recorded, and the next check is not overdue.'
        : summary.status === 'red'
          ? 'Open DCT gaps or mismatches require corrective action before claiming full manual-to-DCT alignment.'
          : summary.status === 'yellow'
            ? 'Scheduled DCT compliance review is overdue; complete a revision check and re-run traceability.'
            : 'Complete a scheduled check and run traceability against current manuals to establish compliance posture.';

    const findings = (enrichedList as any[]).map((r) => ({
      severity: r.comparison.status,
      dctFileName: r.dctDocument.fileName ?? 'DCT',
      questionPreview: (r.question.text ?? '').slice(0, 280),
      evidenceSnippet: r.comparison.evidenceSnippet,
      rationale: r.comparison.rationale,
      resolved: r.comparison.resolved === true,
    }));

    return {
      projectName: project.name,
      statusLabel: st,
      verdict,
      executiveConclusion: conclusion,
      metrics: {
        totalQuestions: metrics.total ?? enrichedList.length,
        aligned,
        gap,
        mismatch,
        pending,
        unresolvedGapOrMismatch: unresolved,
      },
      revision: {
        lastCheckCompletedAt: settings?.lastCheckCompletedAt,
        nextDueAt: settings?.nextDueAt,
        overdue: !!summary.overdue,
        lastXmlIngestAt: settings?.lastXmlIngestAt,
      },
      findings,
      generatedAt: new Date().toISOString(),
    };
  }, [project, summary, enriched, findingsQueue.length, settings, statusBreakdown]);

  const handlePdf = async () => {
    const payload = buildReportPayload();
    if (!payload) {
      toast.error('Nothing to export yet.');
      return;
    }
    const gen = new DctCompliancePdfGenerator();
    const bytes = await gen.generate(payload);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project?.name ?? 'DCT').replace(/\s+/g, '_')}_DCT_Compliance.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('PDF downloaded');
  };

  const handleDocumentCheckPdf = async () => {
    const hasContent =
      documentCheckFindings.length > 0 ||
      documentCheckScope.trim() ||
      documentCheckNotes.trim() ||
      !!activeDocumentCheckId;
    if (!hasContent) {
      toast.error('Nothing to export yet.');
      return;
    }
    const activeRow = (documentChecks ?? []).find((c) => String(c._id) === activeDocumentCheckId);
    const perspectiveLabel =
      localDctDocumentCheckAgentId === 'generic'
        ? 'Generic auditor'
        : AUDIT_AGENTS.find((a) => a.id === localDctDocumentCheckAgentId)?.name ?? localDctDocumentCheckAgentId;

    const findingsForPdf: DctDocumentCheckFindingForPdf[] = sortFindingsBySeverity(documentCheckFindings).map(
      (f) => ({
        severity: f.severity,
        traceStatus: f.status,
        dctFileName: f.dctFileName,
        questionText: f.questionText,
        description: [
          f.questionText,
          f.rationale?.trim(),
          f.evidenceSnippet ? `Evidence snippet: ${f.evidenceSnippet}` : '',
          f.humanStatus && f.humanStatus !== 'draft' ? `Reviewer status: ${f.humanStatus}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        humanStatus: f.humanStatus,
      }),
    );

    const gen = new DctDocumentCheckPdfGenerator();
    const bytes = await gen.generate({
      projectName: project?.name,
      sessionTitle: activeRow
        ? `Session — ${new Date(activeRow.startedAt ?? activeRow.createdAt ?? Date.now()).toLocaleString()}`
        : 'Current session',
      status: String(activeRow?.status ?? 'draft'),
      verdict: documentCheckVerdict,
      scope: documentCheckScope.trim() || undefined,
      notes: documentCheckNotes.trim() || undefined,
      perspectiveLabel,
      model: documentCheckModel,
      totals: activeRow?.totals,
      findings: findingsForPdf,
      startedAt: activeRow?.startedAt ?? activeRow?.createdAt,
      completedAt: activeRow?.completedAt,
      exportedAt: new Date().toISOString(),
    });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `${(project?.name ?? 'DCT').replace(/\s+/g, '_')}_DCT_DocumentCheck_${stamp}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Document check PDF downloaded');
  };

  const handlePersistReport = async () => {
    if (!activeProjectId) return;
    const payload = buildReportPayload();
    if (!payload) return;
    const md = [
      `# DCT Compliance — ${payload.projectName}`,
      `**Status:** ${payload.statusLabel}  **Verdict:** ${payload.verdict}`,
      '',
      payload.executiveConclusion,
      '',
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Aligned | ${payload.metrics.aligned} |`,
      `| Gap | ${payload.metrics.gap} |`,
      `| Mismatch | ${payload.metrics.mismatch} |`,
      `| Pending | ${payload.metrics.pending} |`,
      `| Open gaps/mismatches | ${payload.metrics.unresolvedGapOrMismatch} |`,
    ].join('\n');
    await createReport({
      projectId: activeProjectId as Id<'projects'>,
      title: `DCT Compliance ${new Date().toISOString().slice(0, 10)}`,
      verdict: payload.verdict,
      stats: payload.metrics,
      markdownBody: md,
    });
    toast.success('Report saved to history');
  };

  if (!activeProjectId) {
    return (
      <div ref={ref} className="p-6">
        <GlassCard padding="lg">
          <p className="text-white/70">Select a project to use DCT Compliance.</p>
        </GlassCard>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div ref={ref} className="p-6">
        <GlassCard padding="lg">
          <h2 className="text-xl font-semibold mb-2">DCT Compliance disabled</h2>
          <p className="text-white/60">Enable the feature for your organization in company policy.</p>
        </GlassCard>
      </div>
    );
  }

  const displayStatus = summary?.status ?? 'unknown';
  const coverageTargetPct = Math.round((summary?.comparisonStats?.coverageTarget ?? 0.06) * 100);
  const coveragePct = Math.round((summary?.comparisonStats?.applicableCoverage ?? 0) * 1000) / 10;
  const belowCoverage = !!summary?.comparisonStats?.belowCoverageTarget;

  const totalRequirements = summary?.questionCount ?? 0;
  const applicableCount = summary?.comparisonStats?.applicableCount ?? 0;
  const unsureCount = summary?.comparisonStats?.unsureCount ?? 0;
  const openFindings = findingsQueue.length;

  const tabs: { key: TabKey; label: string; Icon: typeof FiGrid; count?: number }[] = [
    { key: 'overview', label: 'Overview', Icon: FiLayers },
    { key: 'matrix', label: 'Matrix', Icon: FiGrid, count: filteredRows.length },
    { key: 'findings', label: 'Findings', Icon: FiAlertTriangle, count: openFindings + unsureRows.length },
    { key: 'document-check', label: 'Document Check', Icon: FiEye, count: documentCheckFindings.length },
    { key: 'settings', label: 'Settings', Icon: FiSettings },
    { key: 'reports', label: 'Reports', Icon: FiFileText },
  ];

  return (
    <div ref={ref} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 min-h-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-white to-sky-200 bg-clip-text text-transparent flex items-center gap-2">
            <FiLayers className="text-sky-400 shrink-0" />
            DCT Compliance
          </h1>
          <p className="text-white/60 mt-1 max-w-2xl text-sm">
            Sync FAA DCT requirements into the project, run AI traceability against your manuals, and track revision checks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${statusBadgeClass(displayStatus)}`}
          >
            {displayStatus === 'green' ? <FiCheckCircle /> : displayStatus === 'red' ? <FiAlertTriangle /> : <FiClock />}
            {statusLabel(displayStatus)}
          </div>
          <Button
            variant="secondary"
            icon={<FiRefreshCw className={syncingLibrary ? 'animate-spin' : ''} />}
            disabled={syncingLibrary || newLibraryHashesAvailable === 0}
            onClick={() => void handleSyncFromReferenceLibrary()}
          >
            {newLibraryHashesAvailable > 0 ? `Sync library (${newLibraryHashesAvailable})` : 'Library synced'}
          </Button>
          <Button
            icon={<FiZap />}
            onClick={() => void handleRunTraceability()}
            disabled={traceRunning}
          >
            {traceButtonLabel}
          </Button>
        </div>
      </div>

      {traceRunning && traceProgress.total > 0 && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2 text-xs text-sky-100 flex items-center gap-3">
          <FiZap className="shrink-0" />
          <span className="shrink-0">
            Traceability in progress — {traceProgress.processed} of {traceProgress.total} requirements
            processed.
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-sky-400/70 transition-all"
              style={{ width: `${tracePct}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums">{tracePct}%</span>
        </div>
      )}

      {/* Hero stats + coverage */}
      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <GlassCard className="!p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/50 text-xs uppercase tracking-wide">Applicability coverage</p>
            <span className={belowCoverage ? 'text-amber-200 text-xs' : 'text-emerald-300 text-xs'}>
              Target {coverageTargetPct}%
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{coveragePct}%</span>
            <span className="text-white/50 text-sm">of {totalRequirements} requirements applicable</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full ${belowCoverage ? 'bg-amber-400/80' : 'bg-emerald-400/80'} transition-all`}
              style={{ width: `${Math.min(100, Math.max(0, coveragePct))}%` }}
            />
          </div>
          {belowCoverage ? (
            <p className="text-xs text-amber-100/80 mt-3">
              Coverage is below the {coverageTargetPct}% target — review the unsure pool and promote applicable DCTs.
            </p>
          ) : null}
        </GlassCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'DCT files', value: summary?.docCount ?? 0, tone: 'text-white' },
            { label: 'Applicable', value: applicableCount, tone: 'text-emerald-300' },
            { label: 'Unsure', value: unsureCount, tone: 'text-amber-200' },
            { label: 'Open findings', value: openFindings, tone: openFindings ? 'text-red-300' : 'text-white/70' },
          ].map((c) => (
            <GlassCard key={c.label} className="!p-4">
              <div className="text-white/50 text-xs uppercase tracking-wide">{c.label}</div>
              <div className={`text-2xl font-bold mt-1 ${c.tone}`}>{c.value}</div>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Setup → Review Selection → Run status strip */}
      <GlassCard className="!p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {(() => {
            const hasProfile = !!(profile?.repairStationType || profile?.operationsScope || (profile?.certifications ?? []).length > 0);
            const hasStructured =
              Object.values(selectedRatingIds).some(Boolean) ||
              Object.values(selectedCapabilityIds).some(Boolean);
            const step1Ok = hasProfile || hasStructured;
            const corpusFiles = toolDocuments?.length ?? 0;
            const corpusQuestions = enriched?.length ?? 0;
            const step2Ok = corpusFiles > 0 && corpusQuestions > 0;
            const totalSelectable =
              applicabilityBucketCounts.applicable + applicabilityBucketCounts.unsure;
            return (
              <>
                <div className={`rounded-lg border p-3 ${step1Ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                    {step1Ok ? <FiCheckCircle className="text-emerald-300" /> : <FiAlertTriangle className="text-amber-300" />}
                    Step 1 · Profile &amp; ratings
                  </div>
                  <div className="mt-1 text-sm text-white/90">
                    {step1Ok
                      ? (hasStructured ? 'Structured ratings/capabilities selected.' : 'Profile configured.')
                      : 'No entity profile or structured ratings yet.'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="mt-2 text-xs text-sky-300 underline hover:text-sky-200"
                  >
                    {step1Ok ? 'Edit in Settings' : 'Configure in Settings'}
                  </button>
                </div>

                <div className={`rounded-lg border p-3 ${step2Ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                    {step2Ok ? <FiCheckCircle className="text-emerald-300" /> : <FiAlertTriangle className="text-amber-300" />}
                    Step 2 · DCT corpus
                  </div>
                  <div className="mt-1 text-sm text-white/90">
                    {corpusFiles} file{corpusFiles === 1 ? '' : 's'} · {corpusQuestions} question{corpusQuestions === 1 ? '' : 's'}
                  </div>
                  {!step2Ok && (
                    <button
                      type="button"
                      onClick={() => void handleSyncFromReferenceLibrary()}
                      disabled={syncingLibrary || newLibraryHashesAvailable === 0}
                      className="mt-2 text-xs text-sky-300 underline hover:text-sky-200 disabled:opacity-40"
                    >
                      Sync from reference library
                    </button>
                  )}
                </div>

                <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                    <FiZap className="text-sky-300" />
                    Step 3 · Auto-selection
                  </div>
                  <div className="mt-1 text-sm text-white/90 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="text-emerald-300">{applicabilityBucketCounts.applicable} applicable</span>
                    <span className="text-amber-200">{applicabilityBucketCounts.unsure} unsure</span>
                    <span className="text-white/50">{applicabilityBucketCounts.not_applicable} not applicable</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      icon={<FiZap />}
                      onClick={() => handleRunTraceability()}
                      disabled={traceRunning || totalSelectable === 0}
                    >
                      {traceButtonLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FiEye />}
                      onClick={() => handleRunDocumentCheck()}
                      disabled={documentCheckRunning || totalSelectable === 0}
                    >
                      {documentCheckRunning ? 'Running…' : 'Run document check'}
                    </Button>
                  </div>
                  {totalSelectable === 0 && (
                    <div className="mt-2 text-[11px] text-amber-200">
                      No rows auto-selected. Adjust Settings or toggle "Show all DCTs".
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </GlassCard>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1 bg-white/5 border border-white/10 overflow-x-auto">
        {tabs.map(({ key, label, Icon, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === key
                ? 'bg-sky-500/20 text-white border border-sky-400/30 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="text-sm shrink-0" />
            <span>{label}</span>
            {typeof count === 'number' && count > 0 ? (
              <span
                className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full ${
                  activeTab === key ? 'bg-sky-400/30 text-white' : 'bg-white/10 text-white/70'
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          summary={summary}
          settings={settings}
          statusBreakdown={statusBreakdown}
          displayStatus={displayStatus}
          localDctTraceabilityAgentId={localDctTraceabilityAgentId}
          setLocalDctTraceabilityAgentId={setLocalDctTraceabilityAgentId}
          upsertUserSettings={upsertUserSettings}
          activeProjectId={activeProjectId}
          completeCheck={completeCheck}
          upsertDctProjectSettings={upsertDctProjectSettings}
          dctTraceabilityAgentIdFromStore={dctTraceabilityAgentId}
          dctLibraryCount={dctLibraryRefsWithFile.length}
          ingestedCount={toolDocuments?.length ?? 0}
          newLibraryHashesAvailable={newLibraryHashesAvailable}
        />
      )}

      {activeTab === 'matrix' && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FiGrid /> Traceability matrix
            </h2>
            <span className="text-xs text-white/50">
              {filteredRows.length} of {enriched?.length ?? 0} requirements
            </span>
          </div>
          {defaultRunSelection.size > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs text-sky-100 flex items-center justify-between gap-3 flex-wrap">
              <span>
                <strong>{defaultRunSelection.size}</strong> row{defaultRunSelection.size === 1 ? '' : 's'} auto-selected for next run
                {lastRunSelection.size > 0 && lastRunSelection.size !== defaultRunSelection.size ? ' · last run used ' + lastRunSelection.size : ''}.
              </span>
              <button
                type="button"
                onClick={() => setRunSelectionOpen('traceability')}
                className="underline hover:text-white"
              >
                Review selection
              </button>
            </div>
          )}
          {(() => {
            const unstoredApplicable = classifiedEnriched.filter(
              ({ row }) =>
                row.comparison.applicabilityState !== 'applicable' &&
                row.comparison.applicabilityState !== 'unsure' &&
                row.comparison.applicabilityState !== 'not_applicable',
            ).length;
            if (unstoredApplicable === 0) return null;
            return (
              <div className="mb-3 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between gap-3 flex-wrap">
                <span>
                  <strong>{unstoredApplicable}</strong> row{unstoredApplicable === 1 ? '' : 's'} still show
                  {unstoredApplicable === 1 ? 's' : ''} inferred applicability only — accept to persist so filters and
                  the matrix dropdown stop defaulting to "unsure".
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleAutoAcceptApplicability()}
                  disabled={autoAcceptingApplicability}
                >
                  {autoAcceptingApplicability ? 'Accepting…' : 'Auto-accept applicability'}
                </Button>
              </div>
            );
          })()}
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <input
              className="flex-1 min-w-[200px] bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Filter by requirement, Standard DCT ID, MLF, peer group, purpose, or CFR refs…"
              value={matrixFilter}
              onChange={(e) => setMatrixFilter(e.target.value)}
            />
            <select
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              value={matrixStatus}
              onChange={(e) => setMatrixStatus(e.target.value)}
            >
              {['all', 'pending', 'aligned', 'gap', 'mismatch'].map((s) => (
                <option key={s} value={s} className="bg-navy-800">
                  Status: {s}
                </option>
              ))}
            </select>
            <select
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              value={matrixApplicability}
              onChange={(e) => setMatrixApplicability(e.target.value as 'all' | DctApplicabilityState)}
            >
              {['all', 'applicable', 'unsure', 'not_applicable'].map((s) => (
                <option key={s} value={s} className="bg-navy-800">
                  Applicability: {s}
                </option>
              ))}
            </select>
            {matrixDocFilterId ? (
              <Button size="sm" variant="secondary" onClick={() => setMatrixDocFilterId(null)}>
                Clear DCT file filter
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleAutoAcceptApplicability()}
              disabled={autoAcceptingApplicability}
              title="Persist inferred applicability for all rows that don't have a stored value yet"
            >
              {autoAcceptingApplicability ? 'Accepting…' : 'Auto-accept applicability'}
            </Button>
          </div>

          {matrixSelection.size > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 flex flex-wrap items-center gap-2 text-xs text-sky-100">
              <span className="font-medium">
                {matrixSelection.size} selected
              </span>
              <span className="opacity-40">·</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={matrixBulkBusy}
                onClick={() =>
                  void bulkPatchSelected(
                    { applicabilityState: 'applicable' },
                    'Marked applicable',
                  )
                }
              >
                Mark applicable
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={matrixBulkBusy}
                onClick={() =>
                  void bulkPatchSelected(
                    { applicabilityState: 'unsure' },
                    'Marked unsure',
                  )
                }
              >
                Mark unsure
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={matrixBulkBusy}
                onClick={() =>
                  void bulkPatchSelected(
                    { applicabilityState: 'not_applicable' },
                    'Marked not applicable',
                  )
                }
              >
                Mark not applicable
              </Button>
              <span className="opacity-40">·</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={matrixBulkBusy}
                onClick={() =>
                  void bulkPatchSelected({ resolved: true }, 'Marked resolved')
                }
              >
                Mark resolved
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={matrixBulkBusy}
                onClick={() =>
                  void bulkPatchSelected(
                    { resolved: false },
                    'Marked unresolved',
                  )
                }
              >
                Mark unresolved
              </Button>
              <span className="opacity-40 ml-auto">·</span>
              <button
                type="button"
                onClick={() => setMatrixSelection(new Set())}
                className="underline hover:text-white"
                disabled={matrixBulkBusy}
              >
                Clear selection
              </button>
            </div>
          )}

          <details className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 group">
            <summary className="cursor-pointer text-sm text-white/85 font-medium list-none flex items-center gap-2 select-none">
              <span className="transition-transform group-open:rotate-90 text-white/50">▸</span>
              DCT files in this project ({toolDocuments?.length ?? 0})
              <span className="text-white/40 font-normal text-xs ml-1">— click a row to filter the matrix</span>
            </summary>
            <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {!dctFileSummaries.length ? (
                <p className="text-xs text-white/50">
                  No ingested DCT files yet. Upload XML in Library, then use Sync from library on Overview.
                </p>
              ) : (
                dctFileSummaries.map(({ doc, applicable, unsure, notApplicable, total }) => {
                  const selected = matrixDocFilterId === String(doc._id);
                  const prev = purposePreview(doc.purpose, 160);
                  return (
                    <button
                      key={String(doc._id)}
                      type="button"
                      onClick={() =>
                        setMatrixDocFilterId((cur) => (cur === String(doc._id) ? null : String(doc._id)))
                      }
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        selected
                          ? 'border-sky-400/50 bg-sky-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <DctContextPill doc={doc} />
                      {doc.fileName ? (
                        <div className="text-[10px] text-white/40 truncate mt-0.5" title={doc.fileName}>
                          {doc.fileName}
                        </div>
                      ) : null}
                      {prev ? (
                        <p className="text-[11px] text-white/55 mt-1 line-clamp-2">{prev}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-white/50">
                        <span>
                          Req: <span className="text-white/70">{total}</span>
                        </span>
                        <span className="text-emerald-200/90">App: {applicable}</span>
                        <span className="text-amber-200/90">Unsure: {unsure}</span>
                        <span className="text-white/40">N/A: {notApplicable}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </details>

          {(() => {
            const visibleRows = filteredRows.slice(0, 200);
            const visibleIds = visibleRows.map((r) => String(r.comparison._id));
            const allVisibleSelected =
              visibleIds.length > 0 &&
              visibleIds.every((id) => matrixSelection.has(id));
            const someVisibleSelected =
              !allVisibleSelected &&
              visibleIds.some((id) => matrixSelection.has(id));
            const toggleAllVisible = () => {
              setMatrixSelection((prev) => {
                const next = new Set(prev);
                if (allVisibleSelected) {
                  for (const id of visibleIds) next.delete(id);
                } else {
                  for (const id of visibleIds) next.add(id);
                }
                return next;
              });
            };
            const toggleRow = (id: string) => {
              setMatrixSelection((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            };
            return (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto rounded-lg border border-white/10">
            <table className="min-w-full text-left text-xs table-fixed">
              <thead className="bg-white/5 sticky top-0 backdrop-blur z-10">
                <tr>
                  <th className="p-2 text-white/60 font-medium w-10">
                    <label className="flex items-center justify-center" title={allVisibleSelected ? 'Deselect all visible rows' : 'Select all visible rows'}>
                      <input
                        type="checkbox"
                        className="accent-sky-500"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected;
                        }}
                        onChange={toggleAllVisible}
                        aria-label="Select all visible matrix rows"
                      />
                    </label>
                  </th>
                  <th className="p-2 text-white/60 font-medium w-[18%] min-w-[180px]">DCT</th>
                  <th className="p-2 text-white/60 font-medium min-w-[360px]">Requirement</th>
                  <th className="p-2 text-white/60 font-medium w-[14%] min-w-[120px]">References</th>
                  <th className="p-2 text-white/60 font-medium w-[90px]">Status</th>
                  <th className="p-2 text-white/60 font-medium w-[90px]">Severity</th>
                  <th className="p-2 text-white/60 font-medium w-[170px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const rowId = String(row.comparison._id);
                  const classified = classifiedByComparisonId.get(rowId);
                  const effectiveApplicability: DctApplicabilityState =
                    (row.comparison.applicabilityState as DctApplicabilityState | undefined) ??
                    classified?.applicability ??
                    'unsure';
                  const applicabilityStored = classified?.stored === true;
                  const isSelected = matrixSelection.has(rowId);
                  return (
                  <tr
                    key={row.comparison._id}
                    className={`border-t border-white/5 hover:bg-white/[0.03] ${isSelected ? 'bg-sky-500/[0.06]' : ''}`}
                  >
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        className="accent-sky-500"
                        checked={isSelected}
                        onChange={() => toggleRow(rowId)}
                        aria-label="Select row"
                      />
                    </td>
                    <td className="p-2 text-white/80 align-top min-w-0">
                      <DctContextPill doc={row.dctDocument} />
                      {defaultRunSelection.has(rowId) && (
                        <span
                          className="inline-block mt-1 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-200 text-[9px] uppercase tracking-wide"
                          title="This row is auto-selected for the next run"
                        >
                          Selected
                        </span>
                      )}
                      {row.dctDocument.fileName ? (
                        <div
                          className="text-[10px] text-white/40 mt-1 break-all"
                          title={row.dctDocument.fileName}
                        >
                          {row.dctDocument.fileName}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 text-white/90 align-top min-w-0">
                      <div
                        className="whitespace-pre-wrap break-words leading-snug text-[12px]"
                        title={row.question.text ?? ''}
                      >
                        {row.question.text ?? ''}
                      </div>
                      {row.question.noteToUser ? (
                        <p className="text-white/50 mt-1 text-[11px] italic whitespace-pre-wrap break-words">{row.question.noteToUser}</p>
                      ) : null}
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                          Full DCT context…
                        </summary>
                        <DctDocumentSummary doc={row.dctDocument} question={row.question} />
                      </details>
                    </td>
                    <td className="p-2 align-top min-w-0">
                      <DctReferencePills question={row.question} />
                      {!row.question.references?.length ? (
                        <span className="text-white/35 text-[10px]">—</span>
                      ) : null}
                    </td>
                    <td className="p-2 align-top">
                      <span
                        className={
                          row.comparison.status === 'aligned'
                            ? 'text-emerald-300'
                            : row.comparison.status === 'mismatch'
                              ? 'text-red-300'
                              : row.comparison.status === 'gap'
                                ? 'text-amber-300'
                                : 'text-white/50'
                        }
                      >
                        {row.comparison.status}
                      </span>
                    </td>
                    <td className="p-2 align-top">
                      {row.comparison.severity ? (
                        <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase ${findingSeverityBadgeClass(row.comparison.severity as DctFindingSeverity)}`}>
                          {row.comparison.severity}
                        </span>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </td>
                    <td className="p-2 align-top space-y-1">
                      <select
                        className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                        value={effectiveApplicability}
                        title={
                          applicabilityStored
                            ? 'Stored applicability'
                            : 'Inferred — not yet stored. Change to persist, or click Auto-accept applicability.'
                        }
                        onChange={async (e) => {
                          await patchComparison({
                            projectId: activeProjectId as Id<'projects'>,
                            comparisonId: row.comparison._id,
                            status: row.comparison.status,
                            applicabilityState: e.target.value as DctApplicabilityState,
                            applicabilitySource: 'user',
                          });
                        }}
                      >
                        {['applicable', 'unsure', 'not_applicable'].map((s) => (
                          <option key={s} value={s} className="bg-navy-800">
                            {s}
                          </option>
                        ))}
                      </select>
                      <select
                        className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                        value={row.comparison.status}
                        onChange={async (e) => {
                          await patchComparison({
                            projectId: activeProjectId as Id<'projects'>,
                            comparisonId: row.comparison._id,
                            status: e.target.value as any,
                          });
                        }}
                      >
                        {['pending', 'aligned', 'gap', 'mismatch'].map((s) => (
                          <option key={s} value={s} className="bg-navy-800">
                            {s}
                          </option>
                        ))}
                      </select>
                      <select
                        className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                        value={(row.comparison.severity as DctFindingSeverity | undefined) ?? 'observation'}
                        onChange={async (e) => {
                          await patchComparison({
                            projectId: activeProjectId as Id<'projects'>,
                            comparisonId: row.comparison._id,
                            status: row.comparison.status,
                            severity: e.target.value as DctFindingSeverity,
                          });
                        }}
                      >
                        {['critical', 'major', 'minor', 'observation'].map((s) => (
                          <option key={s} value={s} className="bg-navy-800">
                            {s}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-white/50">
                        <input
                          type="checkbox"
                          checked={row.comparison.resolved === true}
                          onChange={async (e) => {
                            await patchComparison({
                              projectId: activeProjectId as Id<'projects'>,
                              comparisonId: row.comparison._id,
                              status: row.comparison.status,
                              resolved: e.target.checked,
                            });
                          }}
                        />
                        Resolved
                      </label>
                    </td>
                  </tr>
                  );
                })}
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-white/40">
                      No requirements match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {filteredRows.length > 200 ? (
              <p className="p-2 text-white/40 text-xs">Showing first 200 rows — narrow filters to see more.</p>
            ) : null}
          </div>
            );
          })()}
        </GlassCard>
      )}

      {activeTab === 'findings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FiAlertTriangle className="text-red-300" /> Open findings
              <span className="ml-auto text-xs text-white/50 font-normal">{findingsQueue.length}</span>
            </h2>
            {findingsQueue.length === 0 ? (
              <p className="text-white/50 text-sm">No open gaps or mismatches.</p>
            ) : (
              <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
                {findingsQueue.slice(0, 30).map((row) => (
                  <li key={row.comparison._id} className="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          row.comparison.status === 'mismatch'
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {row.comparison.status}
                      </span>
                      <div className="min-w-0 flex-1">
                        <DctContextPill doc={row.dctDocument} />
                        {row.dctDocument.fileName ? (
                          <div className="text-[10px] text-white/40 truncate mt-0.5">{row.dctDocument.fileName}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-white mt-1.5 text-sm">{row.question.text}</div>
                    <DctReferencePills question={row.question} />
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                        Full DCT context…
                      </summary>
                      <DctDocumentSummary doc={row.dctDocument} question={row.question} />
                    </details>
                    {row.comparison.rationale ? (
                      <div className="text-white/50 mt-1 text-xs italic">{row.comparison.rationale}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FiClock className="text-amber-300" /> Unsure pool
              <span className="ml-auto text-xs text-white/50 font-normal">{unsureRows.length}</span>
            </h2>
            {!unsureRows.length ? (
              <p className="text-white/50 text-sm">No unsure DCTs right now.</p>
            ) : (
              <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
                {unsureRows.slice(0, 30).map((row) => (
                  <li
                    key={row.comparison._id}
                    className="border border-white/10 rounded-lg p-3 bg-white/[0.02] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <DctContextPill doc={row.dctDocument} />
                      {row.dctDocument.fileName ? (
                        <div className="text-[10px] text-white/40 truncate mt-0.5">{row.dctDocument.fileName}</div>
                      ) : null}
                      <div className="text-white mt-1 text-sm">{row.question.text}</div>
                      <DctReferencePills question={row.question} />
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                          Full DCT context…
                        </summary>
                        <DctDocumentSummary doc={row.dctDocument} question={row.question} />
                      </details>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await patchComparison({
                          projectId: activeProjectId as Id<'projects'>,
                          comparisonId: row.comparison._id,
                          status: row.comparison.status,
                          applicabilityState: 'applicable',
                          applicabilitySource: 'user',
                        });
                        toast.success('Moved to applicable pool');
                      }}
                    >
                      Mark applicable
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      )}

      {activeTab === 'document-check' && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <GlassCard>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FiEye /> Document Check
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  Check applicable DCT questions against entity/regulatory/SMS manuals and capture severity-scored findings.
                </p>
              </div>
              <Button
                icon={<FiPlayCircle />}
                onClick={() => void handleRunDocumentCheck()}
                disabled={documentCheckRunning || applicableRows.length === 0 || mergedCompanyDocs.length === 0}
              >
                {documentCheckRunning ? 'Checking…' : 'Check documents'}
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <GlassCard className="!p-3 border border-white/10">
                <div className="text-[10px] uppercase text-white/50 tracking-wide">Applicable requirements</div>
                <div className="text-xl font-semibold text-white mt-1">{applicableRows.length}</div>
              </GlassCard>
              <GlassCard className="!p-3 border border-white/10">
                <div className="text-[10px] uppercase text-white/50 tracking-wide">Manual documents in scope</div>
                <div className="text-xl font-semibold text-white mt-1">{mergedCompanyDocs.length}</div>
              </GlassCard>
            </div>

            {documentCheckRunning && documentCheckProgress.total > 0 ? (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                  <span>Running document check</span>
                  <span>
                    {documentCheckProgress.processed}/{documentCheckProgress.total}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-sky-400/80"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((documentCheckProgress.processed / documentCheckProgress.total) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Perspective</label>
                <select
                  value={localDctDocumentCheckAgentId}
                  onChange={async (e) => {
                    const next = e.target.value;
                    setLocalDctDocumentCheckAgentId(next);
                    try {
                      await upsertUserSettings({ dctDocumentCheckAgentId: next });
                    } catch (err) {
                      toast.error('Failed to save perspective', {
                        description: getConvexErrorMessage(err),
                      });
                      setLocalDctDocumentCheckAgentId(dctDocumentCheckAgentId);
                    }
                  }}
                  disabled={documentCheckRunning}
                  className="w-full h-10 px-3 text-sm rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  {(DCT_TRACEABILITY_AGENT_IDS as readonly string[]).map((id) => {
                    const agent = AUDIT_AGENTS.find((a) => a.id === id);
                    const label = id === 'generic' ? 'Generic auditor' : agent?.name ?? id;
                    return (
                      <option key={id} value={id} className="bg-navy-800 text-white">
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <PageModelSelector field="dctDocumentCheckModel" />
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Scope</label>
                <textarea
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm min-h-24"
                  value={documentCheckScope}
                  onChange={(e) => setDocumentCheckScope(e.target.value)}
                  placeholder="What sections or requirement domains should this run emphasize?"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Notes</label>
                <textarea
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm min-h-24"
                  value={documentCheckNotes}
                  onChange={(e) => setDocumentCheckNotes(e.target.value)}
                  placeholder="Optional reviewer notes for this session"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(['pass', 'conditional', 'fail'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDocumentCheckVerdict(v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs uppercase tracking-wide ${
                    documentCheckVerdict === v
                      ? v === 'pass'
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                        : v === 'conditional'
                          ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                          : 'bg-red-500/20 border-red-400/40 text-red-200'
                      : 'bg-white/5 border-white/15 text-white/60'
                  }`}
                >
                  {v}
                </button>
              ))}
              {documentCheckSeverityCounts.critical > 0 ? (
                <span className="text-xs text-red-200 ml-2">Critical findings present: auto-fail recommended.</span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {(['critical', 'major', 'minor', 'observation'] as const).map((severity) => (
                <div key={severity} className={`rounded-lg border px-3 py-2 ${findingSeverityBadgeClass(severity)}`}>
                  <div className="text-[10px] uppercase tracking-wide opacity-80">{severity}</div>
                  <div className="text-lg font-semibold mt-0.5">{documentCheckSeverityCounts[severity]}</div>
                </div>
              ))}
            </div>

            <ul className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {sortFindingsBySeverity(documentCheckFindings).map((finding) => {
                const traceRow = enrichedByComparisonId.get(String(finding.comparisonId));
                return (
                <li key={finding.comparisonId} className="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
                  <div className="flex items-start gap-2 flex-wrap mb-2">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase shrink-0 ${findingSeverityBadgeClass(finding.severity)}`}>
                      {finding.severity}
                    </span>
                    <span className="text-[10px] uppercase text-white/50 shrink-0 pt-0.5">{finding.status}</span>
                    <div className="min-w-0 flex-1">
                      {traceRow ? (
                        <>
                          <DctContextPill doc={traceRow.dctDocument} />
                          {traceRow.dctDocument.fileName ? (
                            <div className="text-[10px] text-white/40 truncate mt-0.5" title={traceRow.dctDocument.fileName}>
                              {traceRow.dctDocument.fileName}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-white/50 truncate block">{finding.dctFileName ?? 'DCT'}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-white mb-2">{finding.questionText}</div>
                  {traceRow ? <DctReferencePills question={traceRow.question} /> : null}
                  {traceRow ? (
                    <details className="mt-1.5 mb-2">
                      <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                        Full DCT context…
                      </summary>
                      <DctDocumentSummary doc={traceRow.dctDocument} question={traceRow.question} />
                    </details>
                  ) : null}
                  {finding.rationale ? (
                    <ParsedEvidencePanel text={finding.rationale} fallbackEvidence={finding.evidenceSnippet} />
                  ) : finding.evidenceSnippet ? (
                    <p className="text-xs text-white/60 italic">{finding.evidenceSnippet}</p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <select
                      className="bg-white/10 border border-white/15 rounded px-2 py-1 text-xs"
                      value={finding.severity}
                      onChange={(e) =>
                        setDocumentCheckFindings((prev) =>
                          prev.map((row) =>
                            row.comparisonId === finding.comparisonId
                              ? { ...row, severity: e.target.value as DctFindingSeverity }
                              : row,
                          ),
                        )
                      }
                    >
                      {['critical', 'major', 'minor', 'observation'].map((s) => (
                        <option key={s} value={s} className="bg-navy-800">
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      className="bg-white/10 border border-white/15 rounded px-2 py-1 text-xs"
                      value={finding.humanStatus ?? 'draft'}
                      onChange={(e) =>
                        setDocumentCheckFindings((prev) =>
                          prev.map((row) =>
                            row.comparisonId === finding.comparisonId
                              ? { ...row, humanStatus: e.target.value as 'draft' | 'accepted' | 'needs_work' }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="draft" className="bg-navy-800">Draft</option>
                      <option value="accepted" className="bg-navy-800">Accepted</option>
                      <option value="needs_work" className="bg-navy-800">Needs work</option>
                    </select>
                  </div>
                </li>
                );
              })}
              {!documentCheckFindings.length ? (
                <li className="text-sm text-white/50 border border-dashed border-white/15 rounded-lg p-4">
                  Run a document check to generate severity-scored findings.
                </li>
              ) : null}
            </ul>

            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void handleSaveDocumentCheck()} disabled={!activeDocumentCheckId}>
                Save session
              </Button>
              <Button variant="secondary" onClick={() => void handleCompleteDocumentCheck()} disabled={!activeDocumentCheckId}>
                Complete review
              </Button>
              <Button variant="secondary" onClick={() => void handleDocumentCheckPdf()}>
                Download session PDF
              </Button>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-3">Document check history</h3>
            <ul className="space-y-2 max-h-[780px] overflow-y-auto pr-1">
              {(documentChecks ?? []).map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDocumentCheckId(String(row._id));
                      setDocumentCheckScope(row.scope ?? '');
                      setDocumentCheckNotes(row.notes ?? '');
                      setDocumentCheckVerdict((row.verdict as DctCheckVerdict | undefined) ?? 'pending');
                      setDocumentCheckFindings(Array.isArray(row.findings) ? (row.findings as DctDocumentCheckFinding[]) : []);
                    }}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      activeDocumentCheckId === String(row._id)
                        ? 'border-sky-400/40 bg-sky-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-white/70 uppercase">{row.status}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusBadgeClass(
                        row.verdict === 'pass' ? 'green' : row.verdict === 'fail' ? 'red' : 'yellow',
                      )}`}>
                        {row.verdict ?? 'pending'}
                      </span>
                    </div>
                    <div className="text-white/80 text-xs mt-1">
                      {new Date(row.createdAt ?? row.startedAt).toLocaleString()}
                    </div>
                    <div className="text-white/50 text-[11px] mt-1 truncate">
                      {(row.totals?.questions ?? 0)} questions · {row.model ?? 'model n/a'}
                    </div>
                  </button>
                </li>
              ))}
              {!documentChecks?.length ? <li className="text-white/40 text-xs">No document checks yet.</li> : null}
            </ul>
          </GlassCard>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Schedule */}
          <GlassCard>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <FiClock /> Schedule
            </h2>
            <div className="space-y-3 text-sm text-white/80">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Last check" value={settings?.lastCheckCompletedAt ? new Date(settings.lastCheckCompletedAt).toLocaleDateString() : '—'} />
                <InfoRow
                  label="Next due"
                  value={settings?.nextDueAt ? new Date(settings.nextDueAt).toLocaleDateString() : '—'}
                  highlight={summary?.overdue ? 'amber' : undefined}
                  note={summary?.overdue ? 'overdue' : undefined}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await completeCheck({ projectId: activeProjectId as Id<'projects'> });
                    toast.success('Check completed; next due date advanced.');
                  }}
                >
                  Complete check
                </Button>
                <label className="inline-flex items-center gap-2 text-xs text-white/60">
                  Interval
                  <select
                    className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white"
                    defaultValue={String(settings?.scheduleIntervalDays ?? 7)}
                    onChange={async (e) => {
                      await upsertDctProjectSettings({
                        projectId: activeProjectId as Id<'projects'>,
                        scheduleIntervalDays: Number(e.target.value),
                      });
                      toast.success('Schedule updated');
                    }}
                  >
                    {[1, 7, 14, 30].map((d) => (
                      <option key={d} value={d} className="bg-navy-800">
                        {d} days
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <FiLayers className="text-sky-300" /> Reference library
              </h3>
              <div className="text-xs text-white/60 space-y-1">
                <p>
                  Library files: <span className="text-white">{dctLibraryRefsWithFile.length}</span>
                  {' · '}Ingested: <span className="text-white">{toolDocuments?.length ?? 0}</span>
                  {' · '}New: {' '}
                  <span className={newLibraryHashesAvailable > 0 ? 'text-amber-200' : 'text-white/50'}>
                    {newLibraryHashesAvailable}
                  </span>
                </p>
                <p>
                  Last ingest: {settings?.lastXmlIngestAt ? new Date(settings.lastXmlIngestAt).toLocaleString() : '—'}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                disabled={syncingLibrary || newLibraryHashesAvailable === 0}
                onClick={() => void handleSyncFromReferenceLibrary()}
              >
                {syncingLibrary ? 'Syncing…' : 'Sync from library'}
              </Button>
            </div>
          </GlassCard>

          {/* Applicability */}
          <GlassCard>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <FiSettings /> Applicability filters
            </h2>
            <div className="space-y-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer text-white/80">
                <input
                  type="checkbox"
                  checked={settings?.showAllDcts === true}
                  onChange={async (e) => {
                    await upsertDctProjectSettings({
                      projectId: activeProjectId as Id<'projects'>,
                      showAllDcts: e.target.checked,
                    });
                  }}
                />
                Show all DCTs (ignore profile applicability)
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-white/80">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useManualCorpusForApplicability}
                  onChange={(e) => setUseManualCorpusForApplicability(e.target.checked)}
                />
                <span className="text-xs">
                  Use inline manual excerpts (entity/regulatory/SMS) alongside the entity profile when inferring applicability.
                </span>
              </label>
              {useManualCorpusForApplicability && manualApplicabilityTokens.length === 0 ? (
                <p className="text-xs text-amber-200/80 pl-6">
                  No inline extracted text found — extract documents in Library or disable this option.
                </p>
              ) : useManualCorpusForApplicability ? (
                <p className="text-xs text-white/40 pl-6 truncate" title={manualApplicabilityTokens.join(', ')}>
                  Tokens: {manualApplicabilityTokens.slice(0, 10).join(', ')}
                  {manualApplicabilityTokens.length > 10 ? ` +${manualApplicabilityTokens.length - 10} more` : ''}
                </p>
              ) : null}

              <div>
                <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Mode</label>
                <select
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                  value={applicabilityMode}
                  onChange={(e) => setApplicabilityMode(e.target.value as 'heuristics_only' | 'structured_preferred')}
                >
                  <option value="structured_preferred" className="bg-navy-800">Structured preferred (ratings then heuristics)</option>
                  <option value="heuristics_only" className="bg-navy-800">Heuristics only</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Include</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                    placeholder="145, repair"
                    value={includeOverride}
                    onChange={(e) => setIncludeOverride(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Exclude</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                    placeholder="121, airline"
                    value={excludeOverride}
                    onChange={(e) => setExcludeOverride(e.target.value)}
                  />
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer text-xs text-white/60 hover:text-white/90 list-none flex items-center gap-2">
                  <span className="transition-transform group-open:rotate-90">▸</span>
                  Structured selectors ({(classRatings?.length ?? 0) + (capabilityItems?.length ?? 0)})
                </summary>
                <div className="mt-3 space-y-2">
                  <div className="max-h-32 overflow-auto rounded border border-white/10 p-2 space-y-1">
                    <p className="text-white/45 text-xs font-medium">Class ratings</p>
                    {(classRatings ?? []).map((row) => (
                      <label key={row._id} className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!selectedRatingIds[String(row._id)]}
                          onChange={(e) =>
                            setSelectedRatingIds((prev) => ({
                              ...prev,
                              [String(row._id)]: e.target.checked,
                            }))
                          }
                        />
                        <span>{row.category} class {row.classNumber}</span>
                      </label>
                    ))}
                    {!classRatings?.length ? <p className="text-white/35 text-xs">No class ratings on file.</p> : null}
                  </div>
                  <div className="max-h-32 overflow-auto rounded border border-white/10 p-2 space-y-1">
                    <p className="text-white/45 text-xs font-medium">Capability list items</p>
                    {(capabilityItems ?? []).map((row) => (
                      <label key={row._id} className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!selectedCapabilityIds[String(row._id)]}
                          onChange={(e) =>
                            setSelectedCapabilityIds((prev) => ({
                              ...prev,
                              [String(row._id)]: e.target.checked,
                            }))
                          }
                        />
                        <span>{row.articleDescription}</span>
                      </label>
                    ))}
                    {!capabilityItems?.length ? <p className="text-white/35 text-xs">No capability list items on file.</p> : null}
                  </div>
                </div>
              </details>

              <Button size="sm" variant="secondary" onClick={() => void handleSaveApplicability()}>
                Save applicability filters
              </Button>
            </div>
          </GlassCard>

          {/* Traceability configuration */}
          <GlassCard className="lg:col-span-2">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <FiZap /> Traceability configuration
            </h2>
            <p className="text-xs text-white/60 mb-4">
              Configure the perspective and model used when you run traceability. Use the{' '}
              <strong>Run traceability</strong> button in the page header or the Step 3 card to
              start a run.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-white/50 text-xs uppercase tracking-wide">Perspective</label>
                <select
                  value={localDctTraceabilityAgentId}
                  onChange={async (e) => {
                    const next = e.target.value;
                    setLocalDctTraceabilityAgentId(next);
                    try {
                      await upsertUserSettings({ dctTraceabilityAgentId: next });
                    } catch (err) {
                      console.error('[userSettings.upsert] Failed to save DCT traceability perspective:', err);
                      toast.error('Failed to save perspective', {
                        description: getConvexErrorMessage(err),
                      });
                      setLocalDctTraceabilityAgentId(dctTraceabilityAgentId);
                    }
                  }}
                  disabled={traceRunning}
                  className="h-10 px-3 text-sm rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-sky-light min-w-[220px] disabled:opacity-50"
                  aria-label="DCT traceability perspective"
                >
                  {(DCT_TRACEABILITY_AGENT_IDS as readonly string[]).map((id) => {
                    const agent = AUDIT_AGENTS.find((a) => a.id === id);
                    const label =
                      id === 'generic' ? 'Generic auditor' : agent?.name ?? id;
                    return (
                      <option key={id} value={id} className="bg-navy-800 text-white">
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-white/50 text-xs uppercase tracking-wide">Model</label>
                <PageModelSelector field="dctTraceabilityModel" compact disabled={traceRunning} />
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <GlassCard>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FiFileText /> Reports
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<FiDownload />} onClick={() => void handlePdf()}>
                  PDF
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void handlePersistReport()}>
                  Save snapshot
                </Button>
              </div>
            </div>
            <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">History</h3>
            <ul className="text-sm space-y-1.5 text-white/80 max-h-[440px] overflow-y-auto pr-1">
              {(reports ?? []).map((r) => (
                <li
                  key={r._id}
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-white/5 border border-white/5"
                >
                  <span className="truncate">{r.title}</span>
                  <span className="text-white/40 whitespace-nowrap text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
              {!reports?.length ? <li className="text-white/40 px-3 py-2">No saved reports yet.</li> : null}
            </ul>
          </GlassCard>

          <GlassCard>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FiRefreshCw /> Revision checks
            </h2>
            <ul className="text-xs text-white/70 space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {(revisions ?? []).map((r) => (
                <li key={r._id} className="border-l-2 border-sky-500/40 pl-3 py-1">
                  <div className="text-white/50 text-[10px] uppercase">{r.kind}</div>
                  <div className="text-white/90">{r.summary}</div>
                  <div className="text-white/30 text-[10px] mt-0.5">
                    {r.startedAt ? new Date(r.startedAt).toLocaleString() : ''}
                  </div>
                </li>
              ))}
              {!revisions?.length ? <li className="text-white/40">No runs yet.</li> : null}
            </ul>
          </GlassCard>
        </div>
      )}

      <DctRunSelectionDialog
        open={runSelectionOpen !== null}
        mode={runSelectionOpen ?? 'traceability'}
        rows={runSelectionRows}
        initialSelection={defaultRunSelection}
        running={traceRunning || documentCheckRunning}
        fallbackBannerVisible={fallbackBannerVisible}
        onSwitchToHeuristicsOnly={() => {
          if (!activeProjectId) return;
          setApplicabilityMode('heuristics_only');
          void upsertDctProjectSettings({
            projectId: activeProjectId as Id<'projects'>,
            applicabilityMode: 'heuristics_only',
          });
          toast.success('Switched to heuristics-only mode.');
        }}
        onCancel={() => setRunSelectionOpen(null)}
        onConfirm={(selected) => {
          const mode = runSelectionOpen;
          setRunSelectionOpen(null);
          setLastRunSelection(new Set(selected));
          if (mode === 'traceability') void executeTraceability(selected);
          else if (mode === 'document-check') void executeDocumentCheck(selected);
        }}
      />
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight,
  note,
}: {
  label: string;
  value: string;
  highlight?: 'amber' | 'red' | 'green';
  note?: string;
}) {
  const highlightClass =
    highlight === 'amber'
      ? 'text-amber-200'
      : highlight === 'red'
        ? 'text-red-300'
        : highlight === 'green'
          ? 'text-emerald-300'
          : 'text-white';
  return (
    <div>
      <div className="text-white/50 text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`text-sm mt-0.5 ${highlightClass}`}>
        {value}
        {note ? <span className="ml-1 text-[10px] uppercase">({note})</span> : null}
      </div>
    </div>
  );
}

type EvidenceSegments = {
  requirement?: string;
  evidence?: string;
  gap?: string;
  correctiveAction?: string;
};

function parseEvidenceSegments(text: string): EvidenceSegments {
  const normalized = (text ?? '').replace(/\r\n/g, '\n').replace(/\*\*/g, '').trim();
  if (!normalized) return {};
  const out: EvidenceSegments = {};

  const partMatch = normalized.split('|').map((p) => p.trim()).filter(Boolean);
  for (const part of partMatch) {
    const m = part.match(/^(Requirement|Evidence|Gap|Corrective action)\s*:\s*([\s\S]*?)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2]?.trim();
    if (!value) continue;
    if (key === 'requirement') out.requirement = value;
    else if (key === 'evidence') out.evidence = value;
    else if (key === 'gap') out.gap = value;
    else if (key === 'corrective action') out.correctiveAction = value;
  }

  if (out.requirement || out.evidence || out.gap || out.correctiveAction) return out;
  return {};
}

function ParsedEvidencePanel({ text, fallbackEvidence }: { text: string; fallbackEvidence?: string }) {
  const parts = parseEvidenceSegments(text);
  if (!parts.requirement && !parts.evidence && !parts.gap && !parts.correctiveAction) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <p className="text-xs text-white/60 whitespace-pre-wrap">{text}</p>
        {fallbackEvidence ? <p className="text-[11px] text-white/50 mt-1 italic">{fallbackEvidence}</p> : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
      {parts.requirement ? <p className="text-xs text-white/70"><strong>Requirement:</strong> {parts.requirement}</p> : null}
      {parts.evidence ? <p className="text-xs text-white/70"><strong>Evidence:</strong> {parts.evidence}</p> : null}
      {parts.gap ? <p className="text-xs text-white/70"><strong>Gap:</strong> {parts.gap}</p> : null}
      {parts.correctiveAction ? <p className="text-xs text-white/70"><strong>Corrective action:</strong> {parts.correctiveAction}</p> : null}
      {!parts.evidence && fallbackEvidence ? <p className="text-xs text-white/50 italic">{fallbackEvidence}</p> : null}
    </div>
  );
}

function OverviewTab({
  summary,
  settings,
  statusBreakdown,
  displayStatus,
  dctLibraryCount,
  ingestedCount,
  newLibraryHashesAvailable,
}: {
  summary: any;
  settings: any;
  statusBreakdown: { aligned: number; gap: number; mismatch: number; pending: number };
  displayStatus: string;
  localDctTraceabilityAgentId: string;
  setLocalDctTraceabilityAgentId: (s: string) => void;
  upsertUserSettings: any;
  activeProjectId: string;
  completeCheck: any;
  upsertDctProjectSettings: any;
  dctTraceabilityAgentIdFromStore: string;
  dctLibraryCount: number;
  ingestedCount: number;
  newLibraryHashesAvailable: number;
}) {
  const total = statusBreakdown.aligned + statusBreakdown.gap + statusBreakdown.mismatch + statusBreakdown.pending;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const guidance =
    displayStatus === 'green'
      ? 'All systems clear — traceability is up to date and no open gaps.'
      : displayStatus === 'red'
        ? 'Resolve open gaps or mismatches, then re-run traceability.'
        : displayStatus === 'yellow'
          ? 'Scheduled check is overdue — complete it from Settings and re-run traceability.'
          : newLibraryHashesAvailable > 0
            ? 'Start by syncing new DCT files from your reference library, then run traceability.'
            : 'Run traceability against your manuals to establish compliance posture.';

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FiGrid /> Status breakdown
          </h2>
          {total > 0 ? (
            <span className="text-xs text-white/50">{total} requirements</span>
          ) : null}
        </div>

        <p className="text-sm text-white/70 mb-4 bg-white/[0.03] border border-white/10 rounded-lg p-3">
          {guidance}
        </p>

        {total === 0 ? (
          <div className="text-center py-10">
            <p className="text-white/60 mb-4">No DCT requirements ingested yet.</p>
            <p className="text-xs text-white/40 mb-4">
              Library files: {dctLibraryCount} · Ingested: {ingestedCount}
              {newLibraryHashesAvailable > 0 ? ` · ${newLibraryHashesAvailable} new available` : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-white/5 mb-4">
              {statusBreakdown.aligned > 0 ? (
                <div
                  className="bg-emerald-500/80"
                  style={{ width: `${pct(statusBreakdown.aligned)}%` }}
                  title={`Aligned: ${statusBreakdown.aligned}`}
                />
              ) : null}
              {statusBreakdown.gap > 0 ? (
                <div
                  className="bg-amber-500/80"
                  style={{ width: `${pct(statusBreakdown.gap)}%` }}
                  title={`Gap: ${statusBreakdown.gap}`}
                />
              ) : null}
              {statusBreakdown.mismatch > 0 ? (
                <div
                  className="bg-red-500/80"
                  style={{ width: `${pct(statusBreakdown.mismatch)}%` }}
                  title={`Mismatch: ${statusBreakdown.mismatch}`}
                />
              ) : null}
              {statusBreakdown.pending > 0 ? (
                <div
                  className="bg-white/20"
                  style={{ width: `${pct(statusBreakdown.pending)}%` }}
                  title={`Pending: ${statusBreakdown.pending}`}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatusPill color="emerald" label="Aligned" count={statusBreakdown.aligned} pct={pct(statusBreakdown.aligned)} />
              <StatusPill color="amber" label="Gap" count={statusBreakdown.gap} pct={pct(statusBreakdown.gap)} />
              <StatusPill color="red" label="Mismatch" count={statusBreakdown.mismatch} pct={pct(statusBreakdown.mismatch)} />
              <StatusPill color="white" label="Pending" count={statusBreakdown.pending} pct={pct(statusBreakdown.pending)} />
            </div>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-xs text-white/50">
            Use the <strong>Run traceability</strong> button in the page header or the Step 3
            card above to run against applicable + unsure requirements using your configured
            manuals.
          </p>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <FiClock /> Schedule
        </h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Last check</dt>
            <dd className="text-white/90">
              {settings?.lastCheckCompletedAt
                ? new Date(settings.lastCheckCompletedAt).toLocaleString()
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Next due</dt>
            <dd className={summary?.overdue ? 'text-amber-200' : 'text-white/90'}>
              {settings?.nextDueAt ? new Date(settings.nextDueAt).toLocaleString() : '—'}
              {summary?.overdue ? ' (overdue)' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Last library ingest</dt>
            <dd className="text-white/90">
              {settings?.lastXmlIngestAt ? new Date(settings.lastXmlIngestAt).toLocaleString() : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Interval</dt>
            <dd className="text-white/90">{settings?.scheduleIntervalDays ?? 7} days</dd>
          </div>
        </dl>
        <p className="text-xs text-white/40 mt-4">Manage schedule and library sync in the Settings tab.</p>
      </GlassCard>
    </div>
  );
}

function StatusPill({
  color,
  label,
  count,
  pct,
}: {
  color: 'emerald' | 'amber' | 'red' | 'white';
  label: string;
  count: number;
  pct: number;
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    red: 'bg-red-500/10 text-red-200 border-red-500/30',
    white: 'bg-white/5 text-white/70 border-white/10',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[color]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-lg font-semibold">{count}</span>
        <span className="text-[10px] opacity-60">{pct}%</span>
      </div>
    </div>
  );
}
