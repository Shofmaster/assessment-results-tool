import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiEye,
  FiFileText,
  FiGrid,
  FiLayers,
  FiSettings,
  FiZap,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDctBulkSetMatrixFields,
  useDctCompleteScheduledCheck,
  useDctCreateReport,
  useDctIngestFromParsedLibrary,
  useDctRefreshApplicability,
  useDctUpsertSettings,
  useDctUpdateComparison,
  useDctTraceabilityAgentId,
  useDctTraceabilityModel,
  useDctDocumentCheckAgentId,
  useDctDocumentCheckModel,
  useUpsertUserSettings,
} from '../hooks/useConvexData';
import { useDctData } from '../hooks/useDctData';
import { useDctTraceabilityRun, TRACEABILITY_BATCH_SIZE } from '../hooks/useDctTraceabilityRun';
import { useDctDocumentCheck } from '../hooks/useDctDocumentCheck';
import { type DctFindingSeverity } from '../services/dctDocumentCheckEngine';
import {
  AUDIT_AGENTS,
  DCT_TRACEABILITY_AGENT_IDS,
} from '../services/auditAgents';
import {
  DctCompliancePdfGenerator,
  type DctComplianceReportForPdf,
} from '../services/dctCompliancePdfGenerator';
import {
  DctDocumentCheckPdfGenerator,
  type DctDocumentCheckFindingForPdf,
} from '../services/dctDocumentCheckPdfGenerator';
import { type DctApplicabilityState } from '../utils/dctApplicability';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard } from './ui';
import { dctRowSearchBlob } from './DctContextUi';
import DctRunSelectionDialog from './dct/DctRunSelectionDialog';
import { OverviewTab } from './dct/OverviewTab';
import { CategoryTriageSection } from './dct/CategoryTriageSection';
import { DocumentCheckTab } from './dct/DocumentCheckTab';
import { FindingsTab } from './dct/FindingsTab';
import { MatrixTab } from './dct/MatrixTab';
import { ReportsTab } from './dct/ReportsTab';
import { SettingsTab } from './dct/SettingsTab';
import type { TabKey } from './dct/types';
import {
  classifyRow,
  sortFindingsBySeverity,
  statusBadgeClass,
  statusLabel,
  verdictFromStatus,
} from '../utils/dctCompliancePresenter';
import type { Id } from '../../convex/_generated/dataModel';

export default function DctCompliance() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusViewHeading(ref);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  // Local UI state that feeds applicability classification — declared before
  // useDctData so the hook receives the current values.
  const [useManualCorpusForApplicability, setUseManualCorpusForApplicability] = useState(false);
  const [selectedRatingIds, setSelectedRatingIds] = useState<Record<string, boolean>>({});
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<Record<string, boolean>>({});

  // All Convex *read* queries + data-only derived memos live in this hook.
  const {
    project,
    enabled,
    summary,
    enriched,
    revisions,
    reports,
    toolDocuments,
    documentChecks,
    activeTraceabilityRun,
    settings,
    profile,
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
    dctLibraryRefsWithFile,
    newLibraryHashesAvailable,
    mergedCompanyDocs,
    manualApplicabilityTokens,
    allClassRatings,
    allCapabilityItems,
  } = useDctData(activeProjectId, {
    useManualCorpusForApplicability,
    selectedRatingIds,
    selectedCapabilityIds,
  });

  const ingestFromParsedLibrary = useDctIngestFromParsedLibrary();
  const refreshApplicability = useDctRefreshApplicability();
  const [refreshingApplicability, setRefreshingApplicability] = useState(false);
  const upsertDctProjectSettings = useDctUpsertSettings();
  const upsertUserSettings = useUpsertUserSettings();
  const completeCheck = useDctCompleteScheduledCheck();
  const bulkSetMatrix = useDctBulkSetMatrixFields();
  const patchComparison = useDctUpdateComparison();
  const createReport = useDctCreateReport();

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
  const [matrixFilter, setMatrixFilter] = useState('');
  const [matrixStatus, setMatrixStatus] = useState<string>('all');
  const [matrixApplicability, setMatrixApplicability] = useState<'all' | DctApplicabilityState>('all');
  /** When set, matrix shows only requirements from this ingested `dctToolDocuments` row. */
  const [matrixDocFilterId, setMatrixDocFilterId] = useState<string | null>(null);
  const [includeOverride, setIncludeOverride] = useState('');
  const [excludeOverride, setExcludeOverride] = useState('');
  const [applicabilityMode, setApplicabilityMode] = useState<'heuristics_only' | 'structured_preferred'>('structured_preferred');
  const [localShowAllDcts, setLocalShowAllDcts] = useState(false);
  const [applicabilitySaveState, setApplicabilitySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** Prevents Convex reactivity from clobbering in-progress edits after the first hydrate per project. */
  const hydratedApplicabilityProjectIdRef = useRef<string | null>(null);
  /** Tracks whether a settings row existed on last hydrate (re-hydrate when row is first created). */
  const hadApplicabilitySettingsRowRef = useRef(false);
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
    setLocalShowAllDcts(false);
    setApplicabilitySaveState('idle');
    hydratedApplicabilityProjectIdRef.current = null;
    hadApplicabilitySettingsRowRef.current = false;
  }, [activeProjectId]);
  const [matrixBulkBusy, setMatrixBulkBusy] = useState(false);

  /**
   * Traceability-run orchestration (run state, progress/ETA/stale indicators,
   * start/cancel/resume handlers, status-transition toast effect) lives in
   * {@link useDctTraceabilityRun}. The actual batch loop runs server-side.
   */
  const {
    traceRunning,
    traceProgress,
    traceEtaLabel,
    traceRunStale,
    tracePct,
    traceButtonLabel,
    cancellingTrace,
    dismissedRunSummaryIds,
    setDismissedRunSummaryIds,
    showLastBadResponse,
    setShowLastBadResponse,
    handleRunTraceability,
    executeTraceability,
    handleCancelTraceabilityRun,
    resumeTraceabilityRun,
  } = useDctTraceabilityRun({
    activeProjectId,
    enriched,
    mergedCompanyDocs,
    defaultRunSelection,
    classifiedEnriched,
    activeTraceabilityRun,
    model,
    traceabilityAgentId: localDctTraceabilityAgentId,
    onSelectionSubmitted: setLastRunSelection,
  });

  /**
   * Document-check orchestration (session state, progress, hydrate effect,
   * run/save/complete handlers) lives in {@link useDctDocumentCheck}. The batch
   * loop runs client-side against the Claude proxy in capped batches.
   */
  const {
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
  } = useDctDocumentCheck({
    activeProjectId,
    enriched,
    mergedCompanyDocs,
    defaultRunSelection,
    documentChecks,
    documentCheckModel,
    documentCheckAgentId: localDctDocumentCheckAgentId,
    onSelectionSubmitted: setLastRunSelection,
  });

  const applyApplicabilitySettingsToLocal = useCallback((s: typeof settings | null | undefined) => {
    if (!s) {
      setIncludeOverride('');
      setExcludeOverride('');
      setApplicabilityMode('structured_preferred');
      setSelectedRatingIds({});
      setSelectedCapabilityIds({});
      setLocalShowAllDcts(false);
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
    setLocalShowAllDcts(s.showAllDcts === true);
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      hydratedApplicabilityProjectIdRef.current = null;
      hadApplicabilitySettingsRowRef.current = false;
      return;
    }
    if (summary === undefined) return;
    // Convex may briefly keep the previous project's summary after projectId changes.
    if (
      summary.projectId != null &&
      String(summary.projectId) !== String(activeProjectId)
    ) {
      return;
    }

    const s = summary.settings;
    const hasRow = !!s;

    if (hydratedApplicabilityProjectIdRef.current !== activeProjectId) {
      hydratedApplicabilityProjectIdRef.current = activeProjectId;
      hadApplicabilitySettingsRowRef.current = hasRow;
      applyApplicabilitySettingsToLocal(s);
      return;
    }

    if (!hadApplicabilitySettingsRowRef.current && hasRow) {
      hadApplicabilitySettingsRowRef.current = true;
      applyApplicabilitySettingsToLocal(s);
    }
  }, [activeProjectId, summary, applyApplicabilitySettingsToLocal]);

  const lastSyncedSettingsUpdatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (applicabilitySaveState === 'saving') return;
    if (!activeProjectId || summary === undefined) return;
    if (summary.projectId != null && String(summary.projectId) !== String(activeProjectId)) {
      return;
    }
    const s = summary.settings;
    if (!s?.updatedAt) return;
    if (lastSyncedSettingsUpdatedAtRef.current === s.updatedAt) return;
    lastSyncedSettingsUpdatedAtRef.current = s.updatedAt;
    applyApplicabilitySettingsToLocal(s);
  }, [
    activeProjectId,
    applicabilitySaveState,
    summary,
    applyApplicabilitySettingsToLocal,
  ]);

  useEffect(() => {
    lastSyncedSettingsUpdatedAtRef.current = null;
  }, [activeProjectId]);

  const filteredRows = useMemo(() => {
    if (!enriched?.length) return [];
    const q = matrixFilter.trim().toLowerCase();
    return enriched.filter((row) => {
      const doc = row.dctDocument;
      if (matrixDocFilterId && String(doc._id) !== matrixDocFilterId) return false;
      const applicability = classifyRow(row, classifyCtx).state;
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
    classifyCtx,
  ]);

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
        const result = (await upsertDctProjectSettings({
          projectId: activeProjectId as Id<'projects'>,
          ...patch,
        })) as {
          selectedClassRatingIds?: Id<'entityClassRatings'>[];
          selectedCapabilityIds?: Id<'entityCapabilityList'>[];
          showAllDcts?: boolean;
          includedPeerGroupSubstrings?: string[];
          excludedPeerGroupSubstrings?: string[];
          applicabilityMode?: string;
          updatedAt?: string;
          prunedRatingIds?: Id<'entityClassRatings'>[];
          prunedCapabilityIds?: Id<'entityCapabilityList'>[];
          requestedRatingCount?: number;
          requestedCapabilityCount?: number;
        };

        if (result) {
          applyApplicabilitySettingsToLocal({
            showAllDcts: result.showAllDcts,
            includedPeerGroupSubstrings: result.includedPeerGroupSubstrings,
            excludedPeerGroupSubstrings: result.excludedPeerGroupSubstrings,
            applicabilityMode: result.applicabilityMode,
            selectedClassRatingIds: result.selectedClassRatingIds,
            selectedCapabilityIds: result.selectedCapabilityIds,
          });
          if (result.updatedAt) {
            lastSyncedSettingsUpdatedAtRef.current = result.updatedAt;
          }
        }

        const prunedRatings = result?.prunedRatingIds?.length ?? 0;
        const prunedCaps = result?.prunedCapabilityIds?.length ?? 0;
        const requestedRatings =
          patch.selectedClassRatingIds?.length ?? result?.requestedRatingCount ?? 0;
        const requestedCaps =
          patch.selectedCapabilityIds?.length ?? result?.requestedCapabilityCount ?? 0;
        const storedRatings = result?.selectedClassRatingIds?.length ?? 0;
        const storedCaps = result?.selectedCapabilityIds?.length ?? 0;

        if (
          patch.selectedClassRatingIds != null &&
          (prunedRatings > 0 || storedRatings < requestedRatings)
        ) {
          toast.warning(
            'Some class rating selections could not be saved (stale IDs). Re-select from the list.',
          );
        }
        if (
          patch.selectedCapabilityIds != null &&
          (prunedCaps > 0 || storedCaps < requestedCaps)
        ) {
          toast.warning(
            'Some capability selections could not be saved (stale IDs). Re-select from the list.',
          );
        }

        setApplicabilitySaveState('saved');
        return true;
      } catch (e: unknown) {
        setApplicabilitySaveState('error');
        toast.error(e instanceof Error ? e.message : 'Failed to save applicability filters');
        return false;
      }
    },
    [activeProjectId, applyApplicabilitySettingsToLocal, upsertDctProjectSettings],
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
          {(activeTraceabilityRun?.status === 'queued' ||
            activeTraceabilityRun?.status === 'running') && (
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void handleCancelTraceabilityRun()}
              disabled={cancellingTrace || !!activeTraceabilityRun?.cancelRequested}
            >
              {activeTraceabilityRun?.cancelRequested || cancellingTrace
                ? 'Cancelling…'
                : 'Cancel run'}
            </Button>
          )}
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
        <MatrixTab
          filteredRows={filteredRows}
          enriched={enriched}
          defaultRunSelection={defaultRunSelection}
          lastRunSelection={lastRunSelection}
          matrixFilter={matrixFilter}
          setMatrixFilter={setMatrixFilter}
          matrixStatus={matrixStatus}
          setMatrixStatus={setMatrixStatus}
          matrixApplicability={matrixApplicability}
          setMatrixApplicability={setMatrixApplicability}
          matrixDocFilterId={matrixDocFilterId}
          setMatrixDocFilterId={setMatrixDocFilterId}
          matrixSelection={matrixSelection}
          setMatrixSelection={setMatrixSelection}
          matrixBulkBusy={matrixBulkBusy}
          bulkPatchSelected={bulkPatchSelected}
          refreshingApplicability={refreshingApplicability}
          setRefreshingApplicability={setRefreshingApplicability}
          refreshApplicability={refreshApplicability}
          activeProjectId={activeProjectId}
          toolDocuments={toolDocuments}
          dctFileSummaries={dctFileSummaries}
          classifiedByComparisonId={classifiedByComparisonId}
          patchComparison={patchComparison}
          onReviewSelection={() => setRunSelectionOpen('traceability')}
        />
      )}

      {activeTab === 'findings' && (
        <FindingsTab
          findingsQueue={findingsQueue}
          unsureRows={unsureRows}
          sortedUnsureRows={sortedUnsureRows}
          classifiedByComparisonId={classifiedByComparisonId}
          activeProjectId={activeProjectId}
          unsureSort={unsureSort}
          setUnsureSort={setUnsureSort}
          unsureSelection={unsureSelection}
          setUnsureSelection={setUnsureSelection}
          onBuildReport={handleBuildAndDownloadReport}
          bulkPatchIds={bulkPatchIds}
          patchComparison={patchComparison}
        />
      )}

      {activeTab === 'document-check' && (
        <DocumentCheckTab
          documentCheckRunning={documentCheckRunning}
          applicableRows={applicableRows}
          mergedCompanyDocs={mergedCompanyDocs}
          documentCheckButtonLabel={documentCheckButtonLabel}
          documentCheckProgress={documentCheckProgress}
          localDctDocumentCheckAgentId={localDctDocumentCheckAgentId}
          setLocalDctDocumentCheckAgentId={setLocalDctDocumentCheckAgentId}
          dctDocumentCheckAgentId={dctDocumentCheckAgentId}
          upsertUserSettings={upsertUserSettings}
          documentCheckScope={documentCheckScope}
          setDocumentCheckScope={setDocumentCheckScope}
          documentCheckNotes={documentCheckNotes}
          setDocumentCheckNotes={setDocumentCheckNotes}
          documentCheckVerdict={documentCheckVerdict}
          setDocumentCheckVerdict={setDocumentCheckVerdict}
          documentCheckSeverityCounts={documentCheckSeverityCounts}
          documentCheckFindings={documentCheckFindings}
          setDocumentCheckFindings={setDocumentCheckFindings}
          enrichedByComparisonId={enrichedByComparisonId}
          activeDocumentCheckId={activeDocumentCheckId}
          setActiveDocumentCheckId={setActiveDocumentCheckId}
          documentChecks={documentChecks}
          onRunDocumentCheck={handleRunDocumentCheck}
          onCustomizeSelection={() => setRunSelectionOpen('document-check')}
          onSaveDocumentCheck={handleSaveDocumentCheck}
          onCompleteDocumentCheck={handleCompleteDocumentCheck}
          onDownloadPdf={handleDocumentCheckPdf}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          settings={settings}
          summary={summary}
          activeProjectId={activeProjectId}
          completeCheck={completeCheck}
          upsertDctProjectSettings={upsertDctProjectSettings}
          upsertUserSettings={upsertUserSettings}
          dctLibraryRefsWithFile={dctLibraryRefsWithFile}
          toolDocuments={toolDocuments}
          newLibraryHashesAvailable={newLibraryHashesAvailable}
          syncingLibrary={syncingLibrary}
          onSyncFromReferenceLibrary={handleSyncFromReferenceLibrary}
          localShowAllDcts={localShowAllDcts}
          setLocalShowAllDcts={setLocalShowAllDcts}
          applicabilitySaveState={applicabilitySaveState}
          saveApplicabilityField={saveApplicabilityField}
          useManualCorpusForApplicability={useManualCorpusForApplicability}
          setUseManualCorpusForApplicability={setUseManualCorpusForApplicability}
          manualApplicabilityTokens={manualApplicabilityTokens}
          applicabilityMode={applicabilityMode}
          setApplicabilityMode={setApplicabilityMode}
          includeOverride={includeOverride}
          setIncludeOverride={setIncludeOverride}
          excludeOverride={excludeOverride}
          setExcludeOverride={setExcludeOverride}
          flushIncludeExcludeOverrides={flushIncludeExcludeOverrides}
          allClassRatings={allClassRatings}
          allCapabilityItems={allCapabilityItems}
          selectedRatingIds={selectedRatingIds}
          setSelectedRatingIds={setSelectedRatingIds}
          selectedCapabilityIds={selectedCapabilityIds}
          setSelectedCapabilityIds={setSelectedCapabilityIds}
          selectedRatingIdsList={selectedRatingIdsList}
          selectedCapabilityIdsList={selectedCapabilityIdsList}
          localDctTraceabilityAgentId={localDctTraceabilityAgentId}
          setLocalDctTraceabilityAgentId={setLocalDctTraceabilityAgentId}
          dctTraceabilityAgentId={dctTraceabilityAgentId}
          traceRunning={traceRunning}
        />
      )}

      {activeTab === 'reports' && (
        <ReportsTab
          reports={reports}
          revisions={revisions}
          onPdf={handlePdf}
          onPersistReport={handlePersistReport}
        />
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
