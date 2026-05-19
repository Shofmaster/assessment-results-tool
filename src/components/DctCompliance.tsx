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
  useActiveTraceabilityRun,
  useCancelTraceabilityRun,
  useResumeTraceabilityRun,
  useDctBulkApplyTraceability,
  useDctBulkSetMatrixFields,
  useDctCompleteScheduledCheck,
  useDctComparisonsEnriched,
  useDctCreateReport,
  useDctComplianceSummary,
  useDctIngestFromParsedLibrary,
  useDctRefreshApplicability,
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
  useClassRatingsByCompany,
  useCapabilityListByProject,
  useCapabilityListByCompany,
  useOpSpecsByCompany,
  useDctTraceabilityAgentId,
  useDctTraceabilityModel,
  useDctDocumentCheckAgentId,
  useDctDocumentCheckModel,
  useIsFeatureEnabled,
  useProject,
  useStartTraceabilityRun,
  useUpsertUserSettings,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { parallelMap } from '../services/dctIngestChunks';
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
  buildDctHaystack,
  classifyDctApplicability,
  inferApplicabilityTokens,
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
  const refreshApplicability = useDctRefreshApplicability();
  const [refreshingApplicability, setRefreshingApplicability] = useState(false);
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
  // Server-orchestrated traceability run — closing the tab no longer aborts it.
  const startTraceabilityRun = useStartTraceabilityRun();
  const cancelTraceabilityRun = useCancelTraceabilityRun();
  const resumeTraceabilityRun = useResumeTraceabilityRun();
  const activeTraceabilityRun = useActiveTraceabilityRun(activeProjectId ?? undefined) as
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
  /**
   * Brief local "starting" flag bridges the gap between the user's click and
   * the server creating the run row. Once `activeTraceabilityRun` shows status
   * `queued`/`running`, that becomes the source of truth.
   */
  const [startingTrace, setStartingTrace] = useState(false);
  const [cancellingTrace, setCancellingTrace] = useState(false);
  const [documentCheckRunning, setDocumentCheckRunning] = useState(false);
  const [documentCheckScope, setDocumentCheckScope] = useState('');
  const [documentCheckNotes, setDocumentCheckNotes] = useState('');
  const [documentCheckVerdict, setDocumentCheckVerdict] = useState<DctCheckVerdict>('pending');
  const [documentCheckFindings, setDocumentCheckFindings] = useState<DctDocumentCheckFinding[]>([]);
  const [documentCheckProgress, setDocumentCheckProgress] = useState<{ processed: number; total: number }>({
    processed: 0,
    total: 0,
  });
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

  const TRACEABILITY_BATCH_SIZE = 12;

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
  const [applicabilitySaveState, setApplicabilitySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** Prevents Convex reactivity from clobbering in-progress edits after the first hydrate per project. */
  const hydratedApplicabilityProjectIdRef = useRef<string | null>(null);
  const [runSelectionOpen, setRunSelectionOpen] = useState<null | 'traceability' | 'document-check'>(null);
  const [lastRunSelection, setLastRunSelection] = useState<Set<string>>(new Set());
  /** Comparison IDs explicitly checked in the traceability matrix for bulk actions. */
  const [matrixSelection, setMatrixSelection] = useState<Set<string>>(new Set());
  const [unsureSort, setUnsureSort] = useState<'confidence_asc' | 'confidence_desc' | 'peerGroup' | 'dctFile'>('confidence_desc');
  const [unsureSelection, setUnsureSelection] = useState<Set<string>>(new Set());
  useEffect(() => {
    setMatrixSelection(new Set());
    setUnsureSelection(new Set());
    setSelectedRatingIds({});
    setSelectedCapabilityIds({});
    setIncludeOverride('');
    setExcludeOverride('');
    setApplicabilityMode('structured_preferred');
    setApplicabilitySaveState('idle');
    hydratedApplicabilityProjectIdRef.current = null;
  }, [activeProjectId]);
  const [matrixBulkBusy, setMatrixBulkBusy] = useState(false);
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
    if (!activeProjectId) {
      hydratedApplicabilityProjectIdRef.current = null;
      return;
    }
    if (hydratedApplicabilityProjectIdRef.current === activeProjectId) return;
    if (summary === undefined) return;

    hydratedApplicabilityProjectIdRef.current = activeProjectId;
    const s = summary?.settings;
    if (!s) {
      setIncludeOverride('');
      setExcludeOverride('');
      setApplicabilityMode('structured_preferred');
      setSelectedRatingIds({});
      setSelectedCapabilityIds({});
      return;
    }
    setIncludeOverride((s.includedPeerGroupSubstrings ?? []).join(', '));
    setExcludeOverride((s.excludedPeerGroupSubstrings ?? []).join(', '));
    setApplicabilityMode(
      (s.applicabilityMode as 'heuristics_only' | 'structured_preferred' | undefined) ??
        'structured_preferred',
    );
    const nextRatings: Record<string, boolean> = {};
    for (const id of s.selectedClassRatingIds ?? []) nextRatings[String(id)] = true;
    setSelectedRatingIds(nextRatings);
    const nextCapabilities: Record<string, boolean> = {};
    for (const id of s.selectedCapabilityIds ?? []) nextCapabilities[String(id)] = true;
    setSelectedCapabilityIds(nextCapabilities);
  }, [activeProjectId, summary]);
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
        effectiveExtraTokens,
        structuredApplicability,
        buildDctHaystack(doc, row.question),
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
    effectiveExtraTokens,
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
        effectiveExtraTokens,
        structuredApplicability,
        buildDctHaystack(row.dctDocument, row.question),
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
  }, [toolDocuments, enriched, profile, applicabilitySettings, effectiveExtraTokens, structuredApplicability]);

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
        effectiveExtraTokens,
        structuredApplicability,
        buildDctHaystack(doc, r.question),
      );
      const applicability = (r.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
      return applicability !== 'not_applicable';
    });
  }, [enriched, profile, applicabilitySettings, effectiveExtraTokens, structuredApplicability]);

  const unsureRows = useMemo(
    () =>
      (enriched ?? []).filter((r) => {
        const inferred = classifyDctApplicability(
          r.dctDocument.peerGroupLabel,
          r.dctDocument.mlfLabel,
          r.dctDocument.specialtyLabel,
          profile,
          applicabilitySettings,
          effectiveExtraTokens,
          structuredApplicability,
          buildDctHaystack(r.dctDocument, r.question),
        );
        const applicability = (r.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
        return applicability === 'unsure';
      }),
    [enriched, profile, applicabilitySettings, effectiveExtraTokens, structuredApplicability],
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
          effectiveExtraTokens,
          structuredApplicability,
          buildDctHaystack(r.dctDocument, r.question),
        );
        const applicability = (r.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
        return applicability === 'applicable' || applicability === 'unsure';
      }),
    [enriched, profile, applicabilitySettings, effectiveExtraTokens, structuredApplicability],
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
        effectiveExtraTokens,
        structuredApplicability,
        buildDctHaystack(row.dctDocument, row.question),
      );
      const applicability =
        (row.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
      return { row, applicability, confidence: inferred.confidence };
    });
  }, [enriched, profile, applicabilitySettings, effectiveExtraTokens, structuredApplicability]);

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

  const sortedUnsureRows = useMemo(() => {
    const rows = [...unsureRows];
    if (unsureSort === 'confidence_desc') {
      rows.sort((a, b) => {
        const ca = classifiedByComparisonId.get(String(a.comparison._id))?.confidence ?? 0;
        const cb = classifiedByComparisonId.get(String(b.comparison._id))?.confidence ?? 0;
        return cb - ca;
      });
    } else if (unsureSort === 'confidence_asc') {
      rows.sort((a, b) => {
        const ca = classifiedByComparisonId.get(String(a.comparison._id))?.confidence ?? 0;
        const cb = classifiedByComparisonId.get(String(b.comparison._id))?.confidence ?? 0;
        return ca - cb;
      });
    } else if (unsureSort === 'peerGroup') {
      rows.sort((a, b) =>
        (a.dctDocument.peerGroupLabel ?? '').localeCompare(b.dctDocument.peerGroupLabel ?? ''),
      );
    } else if (unsureSort === 'dctFile') {
      rows.sort((a, b) =>
        (a.dctDocument.fileName ?? '').localeCompare(b.dctDocument.fileName ?? ''),
      );
    }
    return rows;
  }, [unsureRows, unsureSort, classifiedByComparisonId]);

  /** True when the current (structured) filter yields 0 applicable rows — shown as a banner in the dialog. */
  const fallbackBannerVisible =
    applicabilityBucketCounts.applicable === 0 && applicabilityBucketCounts.unsure > 0;

  /** Full-project status counts from server (not truncated enriched slice). */
  const statusBreakdown = useMemo(() => {
    const fromMetrics = summary?.metrics?.status ?? summary?.comparisonStats?.status;
    if (fromMetrics) {
      return {
        aligned: fromMetrics.aligned ?? 0,
        gap: fromMetrics.gap ?? 0,
        mismatch: fromMetrics.mismatch ?? 0,
        pending: fromMetrics.pending ?? 0,
      };
    }
    return { aligned: 0, gap: 0, mismatch: 0, pending: 0 };
  }, [summary]);

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
    : defaultRunSelection.size > 0
      ? `Run traceability on ${defaultRunSelection.size} item${defaultRunSelection.size === 1 ? '' : 's'}`
      : 'Run traceability';
  const documentCheckButtonLabel = documentCheckRunning
    ? documentCheckProgress.total > 0
      ? `Checking… ${documentCheckProgress.processed}/${documentCheckProgress.total}`
      : 'Checking…'
    : defaultRunSelection.size > 0
      ? `Check ${defaultRunSelection.size} item${defaultRunSelection.size === 1 ? '' : 's'}`
      : 'Check documents';
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

  const parsePeerGroupList = useCallback(
    (value: string) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [],
  );

  const selectedRatingIdsList = useCallback(
    (map: Record<string, boolean>) =>
      Object.keys(map).filter((id) => map[id]) as Id<'entityClassRatings'>[],
    [],
  );

  const selectedCapabilityIdsList = useCallback(
    (map: Record<string, boolean>) =>
      Object.keys(map).filter((id) => map[id]) as Id<'entityCapabilityList'>[],
    [],
  );

  const saveApplicabilityField = useCallback(
    async (patch: {
      showAllDcts?: boolean;
      includedPeerGroupSubstrings?: string[];
      excludedPeerGroupSubstrings?: string[];
      applicabilityMode?: 'heuristics_only' | 'structured_preferred';
      selectedClassRatingIds?: Id<'entityClassRatings'>[];
      selectedCapabilityIds?: Id<'entityCapabilityList'>[];
    }) => {
      if (!activeProjectId) return false;
      setApplicabilitySaveState('saving');
      try {
        await upsertDctProjectSettings({
          projectId: activeProjectId as Id<'projects'>,
          ...patch,
        });
        setApplicabilitySaveState('saved');
        return true;
      } catch (e: unknown) {
        setApplicabilitySaveState('error');
        toast.error(e instanceof Error ? e.message : 'Failed to save applicability filters');
        return false;
      }
    },
    [activeProjectId, upsertDctProjectSettings],
  );

  const flushIncludeExcludeOverrides = useCallback(() => {
    void saveApplicabilityField({
      includedPeerGroupSubstrings: parsePeerGroupList(includeOverride),
      excludedPeerGroupSubstrings: parsePeerGroupList(excludeOverride),
    });
  }, [excludeOverride, includeOverride, parsePeerGroupList, saveApplicabilityField]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (applicabilitySaveState !== 'saving') return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [applicabilitySaveState]);

  /**
   * Direct-run traceability on the auto-selected applicable+unsure set.
   * Users who want to hand-pick can open the modal via "Customize selection…".
   */
  const handleRunTraceability = () => {
    if (!activeProjectId || !enriched?.length) {
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
    setLastRunSelection(new Set(defaultRunSelection));
    void executeTraceability(defaultRunSelection);
  };

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
    if (!mergedCompanyDocs.length) return;
    if (selectedIds.size === 0) {
      toast.error('No DCT questions selected.');
      return;
    }
    if (
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
    // Match the previous client-side cap of 40 docs; the action filters out
    // docs without extracted text server-side.
    const docIds = mergedCompanyDocs
      .slice(0, 40)
      .map((d: any) => String(d._id)) as Id<'documents'>[];

    setStartingTrace(true);
    try {
      const batchCount = Math.ceil(comparisonIds.length / TRACEABILITY_BATCH_SIZE);
      const estMinutes = Math.max(8, Math.round((batchCount * 25) / 60));

      startTraceabilityRun({
        projectId: activeProjectId as Id<'projects'>,
        comparisonIds,
        docIds,
        model,
        agentId: localDctTraceabilityAgentId,
        systemPrompt: getDctTraceabilitySystemPrompt(localDctTraceabilityAgentId),
        applicabilityByComparisonId,
        lowConfidenceByComparisonId,
        batchSize: TRACEABILITY_BATCH_SIZE,
      } as any).catch((err: unknown) => {
        // Action rejected (auth, missing API key, etc.) — surface immediately.
        // Mid-run failures land on the run row instead, picked up by the
        // completion effect below.
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Traceability run failed to start: ${message}`);
      });
      toast.success(
        `Traceability started on ${comparisonIds.length} requirements (~${batchCount} API batches, often ${estMinutes}–${estMinutes * 2} min). It keeps running on the server if you leave this page.`,
        { duration: 8000 },
      );
    } finally {
      setStartingTrace(false);
    }
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
    setLastRunSelection(new Set(defaultRunSelection));
    void executeDocumentCheck(defaultRunSelection);
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

  /** Bulk mutate an explicit set of comparison IDs — used by unsure pool bulk actions. */
  const bulkPatchIds = async (
    ids: string[],
    patch: {
      applicabilityState?: DctApplicabilityState;
      status?: 'pending' | 'aligned' | 'gap' | 'mismatch';
      severity?: DctFindingSeverity;
      resolved?: boolean;
    },
    successMessage: string,
  ) => {
    if (!activeProjectId || ids.length === 0) return;
    try {
      let applied = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        const res = (await bulkSetMatrix({
          projectId: activeProjectId as Id<'projects'>,
          comparisonIds: slice as unknown as Id<'dctComparisons'>[],
          ...(patch.applicabilityState !== undefined
            ? { applicabilityState: patch.applicabilityState, applicabilitySource: 'user' }
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
    const rollup = summary.metrics ?? null;
    const stats = summary.comparisonStats ?? { total: 0, pending: 0 };
    const enrichedList = enriched ?? [];
    const { aligned, gap, mismatch, pending } = statusBreakdown;
    const unresolved =
      rollup?.openFindings ?? stats.unresolvedGapOrMismatch ?? findingsQueue.length;
    const totalQuestions =
      rollup?.totalComparisons ?? stats.total ?? enrichedList.length;
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
        totalQuestions,
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

  const handleBuildAndDownloadReport = async () => {
    await handlePersistReport();
    await handlePdf();
    setActiveTab('reports');
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
  const projectMetrics = summary?.metrics ?? null;
  const coverageTargetPct = Math.round(
    (projectMetrics?.coverageTarget ?? summary?.comparisonStats?.coverageTarget ?? 0.06) * 100,
  );
  const coveragePct =
    projectMetrics?.coveragePct ??
    (summary?.comparisonStats?.applicableCoverage != null
      ? Math.round(summary.comparisonStats.applicableCoverage * 1000) / 10
      : 0);
  const belowCoverage =
    projectMetrics?.belowCoverageTarget ?? summary?.comparisonStats?.belowCoverageTarget ?? false;
  const showAllDctsForced =
    projectMetrics?.showAllDcts === true || summary?.comparisonStats?.showAllDcts === true;

  const totalRequirements =
    projectMetrics?.totalComparisons ??
    summary?.comparisonStats?.total ??
    summary?.questionCount ??
    0;
  const applicableCount =
    projectMetrics?.applicability?.applicable ?? summary?.comparisonStats?.applicableCount ?? 0;
  const unsureCount =
    projectMetrics?.applicability?.unsure ?? summary?.comparisonStats?.unsureCount ?? 0;
  const openFindings =
    projectMetrics?.openFindings ?? summary?.comparisonStats?.unresolvedGapOrMismatch ?? findingsQueue.length;

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
        </div>
      </div>

      {traceRunning && traceProgress.total > 0 && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2 text-xs text-sky-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <FiZap className="shrink-0" />
          <div className="min-w-0 flex-1">
            <span>
              Traceability — {traceProgress.processed} of {traceProgress.total} requirements
              {traceEtaLabel ? ` · ${traceEtaLabel}` : ''}
            </span>
            <p className="text-white/45 text-[10px] mt-0.5">
              {TRACEABILITY_BATCH_SIZE} questions per API call · runs in server chunks
            </p>
          </div>
          <div className="flex items-center gap-2 sm:w-48 shrink-0">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400/70 transition-all"
                style={{ width: `${tracePct}%` }}
              />
            </div>
            <span className="tabular-nums shrink-0">{tracePct}%</span>
          </div>
        </div>
      )}
      {traceRunStale ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
          <span>
            Progress paused for 2+ minutes (often after a server timeout). Click Resume to continue
            from {traceProgress.processed} of {traceProgress.total}, or Cancel and start fresh.
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (!activeTraceabilityRun?._id) return;
              try {
                await resumeTraceabilityRun({ runId: activeTraceabilityRun._id as any });
                toast.success('Resuming traceability…');
              } catch (e: any) {
                toast.error(e?.message ?? 'Could not resume run');
              }
            }}
          >
            Resume run
          </Button>
        </div>
      ) : null}
      {(() => {
        if (!activeTraceabilityRun) return null;
        const status = activeTraceabilityRun.status;
        if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
          return null;
        }
        const runId = String(activeTraceabilityRun._id);
        if (dismissedRunSummaryIds.has(runId)) return null;
        const persisted = activeTraceabilityRun.persisted ?? 0;
        const total = activeTraceabilityRun.total ?? 0;
        const parseFailed = activeTraceabilityRun.parseFailed ?? 0;
        const persistFailed = activeTraceabilityRun.persistFailed ?? 0;
        const lastBadResponse = (activeTraceabilityRun as any).lastBadResponse as
          | string
          | undefined;
        const hadFailures = parseFailed > 0 || persistFailed > 0 || persisted === 0;
        const tone = hadFailures
          ? status === 'failed'
            ? 'border-red-500/40 bg-red-500/10 text-red-100'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100';
        const label =
          status === 'failed'
            ? 'Last run failed'
            : status === 'cancelled'
              ? 'Last run cancelled'
              : 'Last run completed';
        return (
          <div className={`rounded-lg border px-4 py-2 text-xs flex flex-col gap-2 ${tone}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{label}</span>
                <span className="opacity-80">
                  Applied {persisted} of {total}
                  {parseFailed > 0 ? ` · ${parseFailed} batch parse failure${parseFailed === 1 ? '' : 's'}` : ''}
                  {persistFailed > 0 ? ` · ${persistFailed} row${persistFailed === 1 ? '' : 's'} not saved` : ''}
                </span>
                {activeTraceabilityRun.error ? (
                  <span className="opacity-90">— {activeTraceabilityRun.error}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {lastBadResponse ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowLastBadResponse((v) => !v)}
                  >
                    {showLastBadResponse ? 'Hide model output' : 'View last model output'}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDismissedRunSummaryIds((prev) => {
                      const next = new Set(prev);
                      next.add(runId);
                      return next;
                    })
                  }
                >
                  Dismiss
                </Button>
              </div>
            </div>
            {showLastBadResponse && lastBadResponse ? (
              <pre className="max-h-64 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-[11px] leading-tight whitespace-pre-wrap text-white/80">
                {lastBadResponse}
              </pre>
            ) : null}
          </div>
        );
      })()}

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
          {showAllDctsForced ? (
            <p className="text-xs text-sky-100/90 mt-3">
              <strong>Show all DCTs</strong> is enabled — every requirement is treated as applicable, so coverage reads 100%.
            </p>
          ) : belowCoverage ? (
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
                      {documentCheckButtonLabel}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setRunSelectionOpen('traceability')}
                      disabled={traceRunning || documentCheckRunning || totalSelectable === 0}
                      className="text-xs text-white/60 underline hover:text-white disabled:opacity-40"
                      title="Hand-pick which DCT questions to run"
                    >
                      Customize selection…
                    </button>
                    {traceRunning &&
                      (activeTraceabilityRun?.status === 'queued' ||
                        activeTraceabilityRun?.status === 'running') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleCancelTraceabilityRun()}
                          disabled={cancellingTrace || !!activeTraceabilityRun?.cancelRequested}
                        >
                          {activeTraceabilityRun?.cancelRequested
                            ? 'Cancelling…'
                            : cancellingTrace
                              ? 'Cancelling…'
                              : 'Cancel run'}
                        </Button>
                      )}
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

      {/* Category Triage */}
      <CategoryTriageSection
        dctFileSummaries={dctFileSummaries}
        profile={profile}
        setMatrixDocFilterId={setMatrixDocFilterId}
        setActiveTab={setActiveTab}
        setMatrixFilter={setMatrixFilter}
      />

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
              disabled={refreshingApplicability || !activeProjectId}
              title="Re-run applicability classifier server-side using current company profile, opspecs, and ratings."
              onClick={async () => {
                if (!activeProjectId) return;
                setRefreshingApplicability(true);
                try {
                  const result = (await refreshApplicability({
                    projectId: activeProjectId as Id<'projects'>,
                  })) as unknown as {
                    evaluated: number;
                    changed: number;
                    skippedUserSource: number;
                    comparisonCount: number;
                    opspecCount: number;
                    ratingCount: number;
                    capabilityCount: number;
                    profileSource: 'company' | 'project' | 'none';
                    applicabilityMode: string;
                    buckets: { applicable: number; unsure: number; not_applicable: number };
                  };
                  const desc =
                    `Profile: ${result.profileSource} · mode: ${result.applicabilityMode} · ` +
                    `${result.opspecCount} opspec(s), ${result.ratingCount} rating(s), ${result.capabilityCount} capability(ies) used. ` +
                    `Buckets → applicable ${result.buckets.applicable}, unsure ${result.buckets.unsure}, n/a ${result.buckets.not_applicable}` +
                    (result.skippedUserSource
                      ? ` · ${result.skippedUserSource} row(s) skipped (manually overridden)`
                      : '');
                  if (result.changed > 0) {
                    toast.success(`Re-stamped ${result.changed} of ${result.evaluated} row(s).`, {
                      description: desc,
                    });
                  } else {
                    toast(`Re-eval ran but no rows changed (${result.evaluated} evaluated).`, {
                      description: desc,
                    });
                  }
                } catch (e) {
                  toast.error(getConvexErrorMessage(e) ?? 'Failed to refresh applicability');
                } finally {
                  setRefreshingApplicability(false);
                }
              }}
            >
              <FiRefreshCw className={refreshingApplicability ? 'animate-spin' : ''} />
              <span className="ml-1">Refresh applicability</span>
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
                            : 'Inferred — change to persist a user override.'
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
                      {!applicabilityStored && (() => {
                        const conf = classifiedByComparisonId.get(rowId)?.confidence;
                        if (conf === undefined) return null;
                        return (
                          <div className="flex items-center">
                            <span
                              className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-white/50 text-[9px] tabular-nums"
                              title="Inferred applicability confidence"
                            >
                              {Math.round(conf * 100)}% conf.
                            </span>
                          </div>
                        );
                      })()}
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
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FiClock className="text-amber-300" /> Unsure pool
                <span className="ml-1 text-xs text-white/50 font-normal">{unsureRows.length}</span>
              </h2>
              <Button
                size="sm"
                icon={<FiDownload />}
                onClick={() => void handleBuildAndDownloadReport()}
              >
                Build Report
              </Button>
            </div>
            {!sortedUnsureRows.length ? (
              <p className="text-white/50 text-sm">No unsure DCTs right now.</p>
            ) : (
              <>
                {/* Sort controls */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <label className="text-[10px] text-white/50 uppercase tracking-wide shrink-0">Sort:</label>
                  <select
                    className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white"
                    value={unsureSort}
                    onChange={(e) => setUnsureSort(e.target.value as typeof unsureSort)}
                  >
                    <option value="confidence_desc" className="bg-navy-800">Confidence ↓ (most likely first)</option>
                    <option value="confidence_asc" className="bg-navy-800">Confidence ↑ (least likely first)</option>
                    <option value="peerGroup" className="bg-navy-800">Peer group A–Z</option>
                    <option value="dctFile" className="bg-navy-800">DCT file A–Z</option>
                  </select>
                </div>

                {/* Select-all */}
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-amber-400"
                      checked={
                        sortedUnsureRows.length > 0 &&
                        sortedUnsureRows.every((r) => unsureSelection.has(String(r.comparison._id)))
                      }
                      ref={(el) => {
                        if (el) {
                          const someSelected = sortedUnsureRows.some((r) => unsureSelection.has(String(r.comparison._id)));
                          const allSelected = sortedUnsureRows.every((r) => unsureSelection.has(String(r.comparison._id)));
                          el.indeterminate = someSelected && !allSelected;
                        }
                      }}
                      onChange={(e) => {
                        setUnsureSelection((prev) => {
                          const next = new Set(prev);
                          for (const r of sortedUnsureRows) {
                            if (e.target.checked) next.add(String(r.comparison._id));
                            else next.delete(String(r.comparison._id));
                          }
                          return next;
                        });
                      }}
                      aria-label="Select all unsure rows"
                    />
                    Select all
                  </label>
                  {unsureSelection.size > 0 && (
                    <span className="text-xs text-white/50">{unsureSelection.size} selected</span>
                  )}
                </div>

                {/* Bulk action bar */}
                {unsureSelection.size > 0 && (
                  <div className="mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 flex flex-wrap items-center gap-2 text-xs text-amber-100">
                    <span className="font-medium">{unsureSelection.size} selected</span>
                    <span className="opacity-40">·</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void bulkPatchIds(
                          Array.from(unsureSelection),
                          { applicabilityState: 'applicable' },
                          'Marked applicable',
                        ).then(() => setUnsureSelection(new Set()))
                      }
                    >
                      Mark all applicable
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void bulkPatchIds(
                          Array.from(unsureSelection),
                          { applicabilityState: 'not_applicable' },
                          'Marked not applicable',
                        ).then(() => setUnsureSelection(new Set()))
                      }
                    >
                      Mark all N/A
                    </Button>
                    <button
                      type="button"
                      onClick={() => setUnsureSelection(new Set())}
                      className="ml-auto underline hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
                  {sortedUnsureRows.slice(0, 30).map((row) => {
                    const rowId = String(row.comparison._id);
                    const conf = classifiedByComparisonId.get(rowId)?.confidence;
                    const isSelected = unsureSelection.has(rowId);
                    return (
                      <li
                        key={row.comparison._id}
                        className={`border rounded-lg p-3 bg-white/[0.02] flex items-start gap-3 ${
                          isSelected ? 'border-amber-400/30 bg-amber-500/[0.04]' : 'border-white/10'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-amber-400 mt-1 shrink-0"
                          checked={isSelected}
                          onChange={() => {
                            setUnsureSelection((prev) => {
                              const next = new Set(prev);
                              if (next.has(rowId)) next.delete(rowId);
                              else next.add(rowId);
                              return next;
                            });
                          }}
                          aria-label="Select for bulk action"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <DctContextPill doc={row.dctDocument} />
                            {conf !== undefined && (
                              <span
                                className="px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-200 text-[10px] font-medium tabular-nums"
                                title="Applicability confidence"
                              >
                                {Math.round(conf * 100)}%
                              </span>
                            )}
                          </div>
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
                        <div className="flex flex-col gap-1.5 shrink-0">
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await patchComparison({
                                projectId: activeProjectId as Id<'projects'>,
                                comparisonId: row.comparison._id,
                                status: row.comparison.status,
                                applicabilityState: 'not_applicable',
                                applicabilitySource: 'user',
                              });
                              toast.success('Moved to not applicable');
                            }}
                          >
                            Mark N/A
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
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
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  icon={<FiPlayCircle />}
                  onClick={() => void handleRunDocumentCheck()}
                  disabled={documentCheckRunning || applicableRows.length === 0 || mergedCompanyDocs.length === 0}
                >
                  {documentCheckButtonLabel}
                </Button>
                <button
                  type="button"
                  onClick={() => setRunSelectionOpen('document-check')}
                  disabled={documentCheckRunning || applicableRows.length === 0 || mergedCompanyDocs.length === 0}
                  className="text-xs text-white/60 underline hover:text-white disabled:opacity-40"
                  title="Hand-pick which DCT questions to run"
                >
                  Customize selection…
                </button>
              </div>
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
                  onChange={(e) => {
                    void saveApplicabilityField({ showAllDcts: e.target.checked });
                  }}
                />
                Show all DCTs (ignore profile applicability)
              </label>
              {settings?.showAllDcts === true ? (
                <p className="text-xs text-sky-100/80 pl-6">
                  When enabled, every DCT requirement is classified as applicable and applicability coverage shows 100%.
                  Turn off to filter by entity profile, class ratings, and op specs.
                </p>
              ) : null}

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
                  onChange={(e) => {
                    const mode = e.target.value as 'heuristics_only' | 'structured_preferred';
                    setApplicabilityMode(mode);
                    void saveApplicabilityField({ applicabilityMode: mode });
                  }}
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
                    onBlur={() => flushIncludeExcludeOverrides()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  <p className="text-[10px] text-white/40 mt-1">Saved on blur or Enter</p>
                </div>
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Exclude</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                    placeholder="121, airline"
                    value={excludeOverride}
                    onChange={(e) => setExcludeOverride(e.target.value)}
                    onBlur={() => flushIncludeExcludeOverrides()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  <p className="text-[10px] text-white/40 mt-1">Saved on blur or Enter</p>
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer text-xs text-white/60 hover:text-white/90 list-none flex items-center gap-2">
                  <span className="transition-transform group-open:rotate-90">▸</span>
                  Structured selectors ({(allClassRatings?.length ?? 0) + (allCapabilityItems?.length ?? 0)})
                </summary>
                <div className="mt-3 space-y-2">
                  <div className="max-h-32 overflow-auto rounded border border-white/10 p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/45 text-xs font-medium">Class ratings</p>
                      {(allClassRatings?.length ?? 0) > 0 ? (
                        <div className="flex items-center gap-2 text-[10px]">
                          <button
                            type="button"
                            className="underline hover:opacity-80 text-white/60"
                            onClick={() => {
                              const next: Record<string, boolean> = {};
                              for (const row of allClassRatings ?? []) next[String(row._id)] = true;
                              setSelectedRatingIds(next);
                              void saveApplicabilityField({
                                selectedClassRatingIds: selectedRatingIdsList(next),
                              });
                            }}
                          >
                            Select all
                          </button>
                          <span className="opacity-40">|</span>
                          <button
                            type="button"
                            className="underline hover:opacity-80 text-white/60"
                            onClick={() => {
                              setSelectedRatingIds({});
                              void saveApplicabilityField({ selectedClassRatingIds: [] });
                            }}
                          >
                            Deselect all
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {(allClassRatings ?? []).map((row) => (
                      <label key={row._id} className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!selectedRatingIds[String(row._id)]}
                          onChange={(e) => {
                            const id = String(row._id);
                            const next = { ...selectedRatingIds, [id]: e.target.checked };
                            if (!e.target.checked) delete next[id];
                            setSelectedRatingIds(next);
                            void saveApplicabilityField({
                              selectedClassRatingIds: selectedRatingIdsList(next),
                            });
                          }}
                        />
                        <span>{row.category} class {row.classNumber}</span>
                      </label>
                    ))}
                    {!allClassRatings?.length ? <p className="text-white/35 text-xs">No class ratings on file.</p> : null}
                  </div>
                  <div className="max-h-32 overflow-auto rounded border border-white/10 p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/45 text-xs font-medium">Capability list items</p>
                      {(allCapabilityItems?.length ?? 0) > 0 ? (
                        <div className="flex items-center gap-2 text-[10px]">
                          <button
                            type="button"
                            className="underline hover:opacity-80 text-white/60"
                            onClick={() => {
                              const next: Record<string, boolean> = {};
                              for (const row of allCapabilityItems ?? []) next[String(row._id)] = true;
                              setSelectedCapabilityIds(next);
                              void saveApplicabilityField({
                                selectedCapabilityIds: selectedCapabilityIdsList(next),
                              });
                            }}
                          >
                            Select all
                          </button>
                          <span className="opacity-40">|</span>
                          <button
                            type="button"
                            className="underline hover:opacity-80 text-white/60"
                            onClick={() => {
                              setSelectedCapabilityIds({});
                              void saveApplicabilityField({ selectedCapabilityIds: [] });
                            }}
                          >
                            Deselect all
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {(allCapabilityItems ?? []).map((row) => (
                      <label key={row._id} className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={!!selectedCapabilityIds[String(row._id)]}
                          onChange={(e) => {
                            const id = String(row._id);
                            const next = { ...selectedCapabilityIds, [id]: e.target.checked };
                            if (!e.target.checked) delete next[id];
                            setSelectedCapabilityIds(next);
                            void saveApplicabilityField({
                              selectedCapabilityIds: selectedCapabilityIdsList(next),
                            });
                          }}
                        />
                        <span>{row.articleDescription}</span>
                      </label>
                    ))}
                    {!allCapabilityItems?.length ? <p className="text-white/35 text-xs">No capability list items on file.</p> : null}
                  </div>
                </div>
              </details>

              <div className="flex items-center gap-3 text-xs text-white/50">
                {applicabilitySaveState === 'saving' ? (
                  <span className="text-sky-200/90">Saving filters…</span>
                ) : applicabilitySaveState === 'saved' ? (
                  <span className="text-emerald-200/90">Filters saved</span>
                ) : applicabilitySaveState === 'error' ? (
                  <span className="text-rose-200/90">Save failed — retry by changing a filter</span>
                ) : (
                  <span>Changes save when you edit each control</span>
                )}
              </div>
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

type DctFileSummary = {
  doc: any;
  applicable: number;
  unsure: number;
  notApplicable: number;
  total: number;
};

function CategoryTriageSection({
  dctFileSummaries,
  profile,
  setMatrixDocFilterId,
  setActiveTab,
  setMatrixFilter,
}: {
  dctFileSummaries: DctFileSummary[];
  profile: any;
  setMatrixDocFilterId: (id: string | null) => void;
  setActiveTab: (tab: TabKey) => void;
  setMatrixFilter: (f: string) => void;
}) {
  const [open, setOpen] = useState(dctFileSummaries.length > 0);

  const profileTokens = useMemo(() => inferApplicabilityTokens(profile), [profile]);

  type GroupEntry = {
    peerGroupLabel: string;
    description: string | null;
    applicable: number;
    unsure: number;
    notApplicable: number;
    total: number;
    docs: DctFileSummary[];
  };

  const groups = useMemo<GroupEntry[]>(() => {
    const map = new Map<string, GroupEntry>();
    for (const s of dctFileSummaries) {
      const key = s.doc.peerGroupLabel ?? s.doc.fileName ?? 'Unknown';
      if (!map.has(key)) {
        // Pick the best human-readable description available on the DCT document.
        const d = s.doc;
        const description: string | null =
          d.mlfName ?? d.mlfLabel ?? d.specialtyLabel ?? d.purpose ?? null;
        map.set(key, { peerGroupLabel: key, description, applicable: 0, unsure: 0, notApplicable: 0, total: 0, docs: [] });
      }
      const g = map.get(key)!;
      g.applicable += s.applicable;
      g.unsure += s.unsure;
      g.notApplicable += s.notApplicable;
      g.total += s.total;
      g.docs.push(s);
    }
    return [...map.values()].sort((a, b) => b.applicable - a.applicable || b.unsure - a.unsure);
  }, [dctFileSummaries]);

  if (!dctFileSummaries.length) return null;

  return (
    <GlassCard className="!p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-white"
      >
        <span className="flex items-center gap-2">
          <FiLayers className="text-sky-400 shrink-0" />
          Category triage — {dctFileSummaries.length} DCT file{dctFileSummaries.length === 1 ? '' : 's'} in {groups.length} group{groups.length === 1 ? '' : 's'}
        </span>
        <span className="text-white/40 text-xs shrink-0">{open ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {profileTokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-white/50 shrink-0">Matched tokens:</span>
              {profileTokens.map((t: string) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full border border-sky-400/40 bg-sky-500/10 text-sky-200 text-[10px] font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {groups.map((g) => {
              const appPct = g.total ? Math.round((g.applicable / g.total) * 100) : 0;
              const unsurePct = g.total ? Math.round((g.unsure / g.total) * 100) : 0;
              const naPct = Math.max(0, 100 - appPct - unsurePct);
              return (
                <div key={g.peerGroupLabel} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {g.description ? (
                          <>
                            <span className="text-sm text-white/90 font-medium">{g.description}</span>
                            <span className="text-[10px] text-white/40 font-mono bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                              {g.peerGroupLabel}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-white/90 font-medium truncate">{g.peerGroupLabel}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/50 mt-0.5">
                        {g.docs.length} file{g.docs.length === 1 ? '' : 's'} · {g.total} req
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <span className="text-[10px] text-emerald-300">{g.applicable} applicable</span>
                      <span className="text-[10px] text-amber-200/90">{g.unsure} unsure</span>
                      <span className="text-[10px] text-white/40">{g.notApplicable} N/A</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (g.docs.length === 1) {
                            setMatrixDocFilterId(String(g.docs[0].doc._id));
                          } else {
                            setMatrixDocFilterId(null);
                            setMatrixFilter(g.peerGroupLabel);
                          }
                          setActiveTab('matrix');
                        }}
                        className="px-2 py-0.5 rounded border border-sky-400/40 bg-sky-500/10 text-sky-200 text-[10px] hover:bg-sky-500/20 transition-colors"
                      >
                        View in Matrix →
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex h-1.5 w-full rounded-full overflow-hidden bg-white/10">
                    {appPct > 0 && (
                      <div className="bg-emerald-500/80" style={{ width: `${appPct}%` }} title={`Applicable: ${g.applicable}`} />
                    )}
                    {unsurePct > 0 && (
                      <div className="bg-amber-400/80" style={{ width: `${unsurePct}%` }} title={`Unsure: ${g.unsure}`} />
                    )}
                    {naPct > 0 && (
                      <div className="bg-white/20" style={{ width: `${naPct}%` }} title={`N/A: ${g.notApplicable}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
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
            <span className="text-xs text-white/50">
              {total} requirements (full project)
            </span>
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
