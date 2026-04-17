import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiFileText,
  FiGrid,
  FiLayers,
  FiRefreshCw,
  FiSettings,
  FiZap,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDctBulkApplyTraceability,
  useDctCompleteScheduledCheck,
  useDctComparisonsEnriched,
  useDctCreateReport,
  useDctComplianceSummary,
  useDctIngestFromParsedLibrary,
  useDctReports,
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
  useIsFeatureEnabled,
  useProject,
  useUpsertUserSettings,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { parallelMap } from '../services/dctIngestChunks';
import { runDctTraceabilityBatch } from '../services/dctTraceabilityEngine';
import {
  AUDIT_AGENTS,
  DCT_TRACEABILITY_AGENT_IDS,
  getDctTraceabilitySystemPrompt,
} from '../services/auditAgents';
import {
  DctCompliancePdfGenerator,
  type DctComplianceReportForPdf,
} from '../services/dctCompliancePdfGenerator';
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
import { PageModelSelector } from './PageModelSelector';
import { getConvexErrorMessage } from '../utils/convexError';
import type { Id } from '../../convex/_generated/dataModel';

type TabKey = 'overview' | 'matrix' | 'findings' | 'settings' | 'reports';

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
  const patchComparison = useDctUpdateComparison();
  const createReport = useDctCreateReport();

  const entity = useDocuments(activeProjectId ?? undefined, 'entity') as any[] | undefined;
  const regulatory = useDocuments(activeProjectId ?? undefined, 'regulatory') as any[] | undefined;
  const sms = useDocuments(activeProjectId ?? undefined, 'sms') as any[] | undefined;
  const uploaded = useDocuments(activeProjectId ?? undefined, 'uploaded') as any[] | undefined;
  const coEntity = useDocumentsByCompany(companyId ? String(companyId) : undefined, 'entity') as any[] | undefined;
  const coReg = useDocumentsByCompany(companyId ? String(companyId) : undefined, 'regulatory') as any[] | undefined;
  const classRatings = useClassRatingsByProject(activeProjectId ?? undefined) as any[] | undefined;
  const capabilityItems = useCapabilityListByProject(activeProjectId ?? undefined) as any[] | undefined;

  const model = useDctTraceabilityModel();
  const validDctTraceabilityAgentIds = useMemo(
    () => new Set(DCT_TRACEABILITY_AGENT_IDS as readonly string[]),
    [],
  );
  const dctTraceabilityAgentIdFromStore = useDctTraceabilityAgentId();
  const dctTraceabilityAgentId = validDctTraceabilityAgentIds.has(dctTraceabilityAgentIdFromStore)
    ? dctTraceabilityAgentIdFromStore
    : 'faa-dct-traceability';

  const [localDctTraceabilityAgentId, setLocalDctTraceabilityAgentId] = useState<string>(
    dctTraceabilityAgentId,
  );
  useEffect(() => {
    setLocalDctTraceabilityAgentId(dctTraceabilityAgentId);
  }, [dctTraceabilityAgentId]);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [useManualCorpusForApplicability, setUseManualCorpusForApplicability] = useState(false);
  const [traceRunning, setTraceRunning] = useState(false);
  const [matrixFilter, setMatrixFilter] = useState('');
  const [matrixStatus, setMatrixStatus] = useState<string>('all');
  const [matrixApplicability, setMatrixApplicability] = useState<'all' | DctApplicabilityState>('all');
  const [includeOverride, setIncludeOverride] = useState('');
  const [excludeOverride, setExcludeOverride] = useState('');
  const [selectedRatingIds, setSelectedRatingIds] = useState<Record<string, boolean>>({});
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<Record<string, boolean>>({});
  const [applicabilityMode, setApplicabilityMode] = useState<'heuristics_only' | 'structured_preferred'>('structured_preferred');

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
      const blob = `${row.question.text} ${doc.fileName ?? ''} ${st} ${applicability}`.toLowerCase();
      return blob.includes(q);
    });
  }, [enriched, matrixFilter, matrixStatus, matrixApplicability, profile, applicabilitySettings, manualExtraTokens, structuredApplicability]);

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
      includedPeerGroupSubstrings: inc.length ? inc : undefined,
      excludedPeerGroupSubstrings: exc.length ? exc : undefined,
      applicabilityMode,
      selectedClassRatingIds: Object.keys(selectedRatingIds).filter((id) => selectedRatingIds[id]) as any,
      selectedCapabilityIds: Object.keys(selectedCapabilityIds).filter((id) => selectedCapabilityIds[id]) as any,
    });
    toast.success('Applicability filters saved.');
  };

  const handleRunTraceability = async () => {
    if (!activeProjectId || !enriched?.length) {
      toast.error('Use Sync from library to copy DCT requirements into this project first.');
      return;
    }
    if (!mergedCompanyDocs.length) {
      toast.error('Add entity/regulatory manuals with extracted text to the project first.');
      return;
    }
    setTraceRunning(true);
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
      const applicableQuestions = enriched.filter((row) => {
        const inferred = classifyDctApplicability(
          row.dctDocument.peerGroupLabel,
          row.dctDocument.mlfLabel,
          row.dctDocument.specialtyLabel,
          profile,
          applicabilitySettings,
          manualExtraTokens,
          structuredApplicability,
        );
        const applicability = (row.comparison.applicabilityState as DctApplicabilityState | undefined) ?? inferred.state;
        return applicability === 'applicable' || applicability === 'unsure';
      });
      const lowConfidenceByComparisonId = new Map<string, boolean>(
        applicableQuestions.map((row) => [
          String(row.comparison._id),
          (row.comparison.applicabilityState as DctApplicabilityState | undefined) === 'unsure',
        ]),
      );
      const questions = applicableQuestions.map((row) => ({
        comparisonId: String(row.comparison._id),
        questionText:
          row.comparison.applicabilityState === 'unsure'
            ? `[LOW CONFIDENCE APPLICABILITY] ${row.question.text}`
            : row.question.text,
        dctFileName: row.dctDocument.fileName,
        questionReferences: (row.question.references ?? []).map((r: any) => r.label),
        lowConfidenceApplicability: row.comparison.applicabilityState === 'unsure',
      }));
      if (!questions.length) {
        toast.error('No applicable DCT questions found — adjust applicability settings or check your entity profile.');
        return;
      }
      const results = await runDctTraceabilityBatch(model, docsForAi, questions, {
        batchSize: 10,
        systemPrompt: getDctTraceabilitySystemPrompt(localDctTraceabilityAgentId),
      });
      if (!results.length) {
        toast.error('No AI results returned. Try again or check API logs.');
        return;
      }
      await bulkTrace({
        projectId: activeProjectId as Id<'projects'>,
        results: results.map((r) => ({
          comparisonId: r.comparisonId as Id<'dctComparisons'>,
          status: r.status,
          underReviewDocumentId: r.underReviewDocumentId as Id<'documents'> | undefined,
          evidenceSnippet: r.evidenceSnippet,
          rationale: r.rationale,
          lowConfidenceApplicability: lowConfidenceByComparisonId.get(r.comparisonId) === true,
        })),
      });
      toast.success(`Applied traceability to ${results.length} requirement(s).`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Traceability run failed');
    } finally {
      setTraceRunning(false);
    }
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
            {traceRunning ? 'Running…' : 'Run traceability'}
          </Button>
        </div>
      </div>

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
          traceRunning={traceRunning}
          localDctTraceabilityAgentId={localDctTraceabilityAgentId}
          setLocalDctTraceabilityAgentId={setLocalDctTraceabilityAgentId}
          upsertUserSettings={upsertUserSettings}
          activeProjectId={activeProjectId}
          completeCheck={completeCheck}
          upsertDctProjectSettings={upsertDctProjectSettings}
          onRunTraceability={() => void handleRunTraceability()}
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
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              className="flex-1 min-w-[200px] bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Filter by requirement text, file, or status…"
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
          </div>
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto rounded-lg border border-white/10">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 sticky top-0 backdrop-blur">
                <tr>
                  <th className="p-2 text-white/60 font-medium">DCT</th>
                  <th className="p-2 text-white/60 font-medium">Requirement</th>
                  <th className="p-2 text-white/60 font-medium">Status</th>
                  <th className="p-2 text-white/60 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((row) => (
                  <tr key={row.comparison._id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="p-2 text-white/80 align-top max-w-[140px] break-all">
                      {row.dctDocument.fileName ?? '—'}
                    </td>
                    <td className="p-2 text-white/90 align-top">{(row.question.text ?? '').slice(0, 220)}</td>
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
                    <td className="p-2 align-top space-y-1">
                      <select
                        className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                        value={row.comparison.applicabilityState ?? 'unsure'}
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
                ))}
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-white/40">
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
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          row.comparison.status === 'mismatch'
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {row.comparison.status}
                      </span>
                      <span className="text-white/50 truncate">{row.dctDocument.fileName}</span>
                    </div>
                    <div className="text-white mt-1.5 text-sm">{row.question.text}</div>
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
                    <div className="min-w-0">
                      <div className="text-white/50 text-xs truncate">{row.dctDocument.fileName}</div>
                      <div className="text-white mt-1 text-sm">{row.question.text}</div>
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
              Uses manuals with extracted text (entity, regulatory, SMS, uploaded). Choose perspective and model, then run against applicable and unsure DCT questions.
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
              <Button onClick={() => void handleRunTraceability()} disabled={traceRunning} icon={<FiZap />}>
                {traceRunning ? 'Running…' : 'Run traceability'}
              </Button>
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

function OverviewTab({
  summary,
  settings,
  statusBreakdown,
  displayStatus,
  onRunTraceability,
  traceRunning,
  dctLibraryCount,
  ingestedCount,
  newLibraryHashesAvailable,
}: {
  summary: any;
  settings: any;
  statusBreakdown: { aligned: number; gap: number; mismatch: number; pending: number };
  displayStatus: string;
  traceRunning: boolean;
  localDctTraceabilityAgentId: string;
  setLocalDctTraceabilityAgentId: (s: string) => void;
  upsertUserSettings: any;
  activeProjectId: string;
  completeCheck: any;
  upsertDctProjectSettings: any;
  onRunTraceability: () => void;
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

        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
          <Button onClick={onRunTraceability} disabled={traceRunning} icon={<FiZap />}>
            {traceRunning ? 'Running…' : 'Run traceability'}
          </Button>
          <p className="text-xs text-white/40">
            Runs against applicable + unsure requirements using your configured manuals.
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
