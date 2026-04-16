import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiLayers,
  FiRefreshCw,
  FiZap,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDctAddDrssToSharedReferences,
  useDctBulkApplyTraceability,
  useDctCompleteScheduledCheck,
  useDctComparisonsEnriched,
  useDctCreateReport,
  useDctFinalizeLibraryVersionUpdate,
  useDctDrssCatalog,
  useDctIngestXmlBatch,
  useDctComplianceSummary,
  useDctReports,
  useDctRevisionChecks,
  useSharedReferenceDocsResolved,
  useDctSyncDrssCatalog,
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
  fetchSharedReferenceDocumentFileUrlsBatch,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import {
  DEFAULT_DCT_INGEST_BATCH_SIZE,
  ingestDctDocumentsInChunks,
  parallelMap,
} from '../services/dctIngestChunks';
import { parseDctXmlString, type ParsedDctToolDocument } from '../services/dctXmlParser';
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

function statusBadgeClass(status: string) {
  if (status === 'green') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40';
  if (status === 'yellow') return 'bg-amber-500/20 text-amber-100 border-amber-500/40';
  if (status === 'red') return 'bg-red-500/20 text-red-200 border-red-500/40';
  return 'bg-white/10 text-white/70 border-white/20';
}

function verdictFromStatus(status: string): 'pass' | 'conditional' | 'fail' | 'pending' {
  if (status === 'green') return 'pass';
  if (status === 'yellow') return 'conditional';
  if (status === 'red') return 'fail';
  return 'pending';
}

const DCT_SIG_SEP = '::';

function makeDctReferenceSignature(ref: any): string {
  const rawPath = String(ref?.path ?? ref?.name ?? ref?._id ?? '').trim().toLowerCase();
  const path = rawPath || String(ref?._id ?? 'unknown');
  const token = String(
    ref?.contentHash ??
      ref?.revision ??
      ref?.effectiveDate ??
      ref?.addedAt ??
      ref?._id ??
      'unknown',
  ).trim();
  return `${path}${DCT_SIG_SEP}${token}`;
}

function splitDctReferenceSignature(sig: string): { path: string; token: string } {
  const idx = sig.indexOf(DCT_SIG_SEP);
  if (idx < 0) return { path: sig, token: '' };
  return { path: sig.slice(0, idx), token: sig.slice(idx + DCT_SIG_SEP.length) };
}

function compareDctReferenceSignatures(base: string[], current: string[]) {
  const baseMap = new Map<string, string>();
  for (const sig of base) {
    const parsed = splitDctReferenceSignature(sig);
    baseMap.set(parsed.path, parsed.token);
  }
  const currentMap = new Map<string, string>();
  for (const sig of current) {
    const parsed = splitDctReferenceSignature(sig);
    currentMap.set(parsed.path, parsed.token);
  }
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [path, token] of currentMap) {
    if (!baseMap.has(path)) {
      added++;
      continue;
    }
    if (baseMap.get(path) !== token) changed++;
  }
  for (const path of baseMap.keys()) {
    if (!currentMap.has(path)) removed++;
  }
  return { added, removed, changed };
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
  const catalog = useDctDrssCatalog(activeProjectId ?? undefined) as any[] | undefined;
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

  const ingestBatch = useDctIngestXmlBatch();
  const syncDrss = useDctSyncDrssCatalog();
  const addRefs = useDctAddDrssToSharedReferences();
  const upsertDctProjectSettings = useDctUpsertSettings();
  const upsertUserSettings = useUpsertUserSettings();
  const completeCheck = useDctCompleteScheduledCheck();
  const bulkTrace = useDctBulkApplyTraceability();
  const patchComparison = useDctUpdateComparison();
  const createReport = useDctCreateReport();
  const finalizeLibraryVersionUpdate = useDctFinalizeLibraryVersionUpdate();

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

  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [autoPrefetching, setAutoPrefetching] = useState(false);
  const [useManualCorpusForApplicability, setUseManualCorpusForApplicability] = useState(false);
  const [traceRunning, setTraceRunning] = useState(false);
  const [drsText, setDrsText] = useState('');
  const [matrixFilter, setMatrixFilter] = useState('');
  const [matrixStatus, setMatrixStatus] = useState<string>('all');
  const [matrixApplicability, setMatrixApplicability] = useState<'all' | DctApplicabilityState>('all');
  const [includeOverride, setIncludeOverride] = useState('');
  const [excludeOverride, setExcludeOverride] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<Record<string, boolean>>({});
  const [selectedRatingIds, setSelectedRatingIds] = useState<Record<string, boolean>>({});
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<Record<string, boolean>>({});
  const [applicabilityMode, setApplicabilityMode] = useState<'heuristics_only' | 'structured_preferred'>('structured_preferred');
  const lastAutoSyncAttemptKeyRef = useRef<string | null>(null);

  const settings = summary?.settings;
  const currentLibrarySnapshot = useMemo(() => {
    const signatures = Array.from(
      new Set((dctSharedRefs ?? []).map((ref) => makeDctReferenceSignature(ref))),
    ).sort();
    let latest = '';
    for (const ref of dctSharedRefs ?? []) {
      const addedAt = String(ref?.addedAt ?? '');
      if (addedAt && addedAt > latest) latest = addedAt;
    }
    const label = latest ? `library@${latest}` : 'library@unknown';
    return { signatures, label };
  }, [dctSharedRefs]);
  const trackingMode = (settings?.dctLibraryTrackingMode as 'latest' | 'pinned' | undefined) ?? 'latest';
  const pinnedSignatures = (settings?.pinnedDctReferenceSignatures ?? []) as string[];
  const lastSyncedSignatures = (settings?.lastDctLibrarySyncSignatures ?? []) as string[];
  const baselineSignatures =
    trackingMode === 'pinned' && pinnedSignatures.length > 0
      ? pinnedSignatures
      : lastSyncedSignatures;
  const libraryDeltaPreview = useMemo(
    () => compareDctReferenceSignatures(baselineSignatures, currentLibrarySnapshot.signatures),
    [baselineSignatures, currentLibrarySnapshot.signatures],
  );
  const hasLibraryDeltaPreview =
    libraryDeltaPreview.added + libraryDeltaPreview.removed + libraryDeltaPreview.changed > 0;
  const currentLibrarySignatureKey = currentLibrarySnapshot.signatures.join('|');
  const lastSyncedLibrarySignatureKey = lastSyncedSignatures.join('|');

  useEffect(() => {
    lastAutoSyncAttemptKeyRef.current = null;
  }, [activeProjectId]);

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
  const libraryVersionEvents = useMemo(
    () =>
      (revisions ?? [])
        .filter((r) => String(r?.kind ?? '') === 'library_version_update')
        .slice(0, 12),
    [revisions],
  );

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
      selectedRatings: (classRatings ?? []).filter((row) => selectedRatingIds[String(row._id)]),
      selectedCapabilities: (capabilityItems ?? []).filter((row) => selectedCapabilityIds[String(row._id)]),
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

  const ingestBatchTyped = ingestBatch as (payload: {
    projectId: Id<'projects'>;
    documents: ParsedDctToolDocument[];
    skipExistingByHash?: boolean;
  }) => Promise<unknown>;

  const handleSyncFromReferenceLibrary = async (opts?: {
    finalizeMode?: 'latest' | 'pinned';
    baselineSignatures?: string[];
    /** Subset to download/parse/ingest; default = all refs with storage. */
    refsToPrepare?: any[];
    /** When true and refsToPrepare is empty, only update library version metadata (no network). */
    finalizeOnlyIfNothingToPrepare?: boolean;
  }) => {
    if (!activeProjectId) {
      toast.error('Select a project first.');
      return;
    }
    const refsAll = (dctSharedRefs ?? []).filter((r: any) => r.storageId);
    const referenceSignatures = Array.from(
      new Set(refsAll.map((ref: any) => makeDctReferenceSignature(ref))),
    ).sort();
    const latestRefAddedAt = refsAll.reduce((latest: string, ref: any) => {
      const addedAt = String(ref?.addedAt ?? '');
      return addedAt > latest ? addedAt : latest;
    }, '');
    const libraryLabel = latestRefAddedAt ? `library@${latestRefAddedAt}` : 'library@unknown';
    const baseline = opts?.baselineSignatures ?? baselineSignatures;
    const deltaSummary = compareDctReferenceSignatures(baseline, referenceSignatures);
    if (!refsAll.length) {
      toast.error('No shared DCT XML reference documents with file storage were found.');
      return;
    }

    const refsToPrepare = opts?.refsToPrepare ?? refsAll;
    if (
      refsToPrepare.length === 0 &&
      opts?.finalizeOnlyIfNothingToPrepare === true
    ) {
      await finalizeLibraryVersionUpdate({
        projectId: activeProjectId as Id<'projects'>,
        trackingMode: opts?.finalizeMode ?? trackingMode,
        referenceSignatures,
        label: libraryLabel,
        addedCount: deltaSummary.added,
        removedCount: deltaSummary.removed,
        changedCount: deltaSummary.changed,
      });
      return;
    }

    setSyncingLibrary(true);
    try {
      const toastId = toast.loading(`Preparing ${refsToPrepare.length} shared DCT XML file(s)…`);
      const urlRows = await fetchSharedReferenceDocumentFileUrlsBatch(convex, refsToPrepare.map((r: any) => r._id as Id<'sharedReferenceDocuments'>));
      const urlById = new Map<string, string | null>(
        (urlRows as { documentId: Id<'sharedReferenceDocuments'>; url: string | null }[]).map((row) => [
          String(row.documentId),
          row.url,
        ]),
      );

      const progress = { done: 0 };
      const results = await parallelMap(refsToPrepare, 8, async (refDoc: any, i: number) => {
        const label = String(refDoc?.path ?? refDoc?.name ?? `shared-dct-${i + 1}.xml`);
        try {
          const fileUrl = urlById.get(String(refDoc._id));
          if (!fileUrl) throw new Error('missing file URL');
          const response = await fetch(fileUrl);
          if (!response.ok) throw new Error(`download failed (${response.status})`);
          const xmlText = await response.text();
          const doc = parseDctXmlString(label, xmlText);
          progress.done += 1;
          if (progress.done % 5 === 0 || progress.done === refsToPrepare.length) {
            toast.loading(`Prepared ${progress.done}/${refsToPrepare.length} shared reference file(s)…`, {
              id: toastId,
            });
          }
          return { ok: true as const, doc };
        } catch (e: unknown) {
          progress.done += 1;
          if (progress.done % 5 === 0 || progress.done === refsToPrepare.length) {
            toast.loading(`Prepared ${progress.done}/${refsToPrepare.length} shared reference file(s)…`, {
              id: toastId,
            });
          }
          return {
            ok: false as const,
            error: `${label}: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      });

      const documents: ParsedDctToolDocument[] = [];
      const parseErrors: string[] = [];
      for (const r of results) {
        if (r.ok) documents.push(r.doc);
        else parseErrors.push(r.error);
      }
      if (!documents.length) {
        toast.error('No usable DCT XML files were parsed from shared references.', {
          id: toastId,
          description: parseErrors.length ? parseErrors.slice(0, 6).join(' · ') : undefined,
        });
        return;
      }
      toast.loading(`Ingesting ${documents.length} shared DCT XML file(s)…`, { id: toastId });
      const { totalIngested, totalSkipped, chunkErrors } = await ingestDctDocumentsInChunks({
        ingestBatch: ({ projectId, documents: docs, skipExistingByHash }) =>
          ingestBatchTyped({
            projectId: projectId as Id<'projects'>,
            documents: docs,
            skipExistingByHash,
          }),
        projectId: String(activeProjectId),
        documents,
        skipExistingByHash: true,
        batchSize: DEFAULT_DCT_INGEST_BATCH_SIZE,
        onProgress: (done, total, skipped) => {
          const msg = skipped > 0
            ? `Ingested ${done}/${total} documents (${skipped} skipped unchanged)…`
            : `Ingested ${done}/${total} documents…`;
          toast.loading(msg, { id: toastId });
        },
      });
      const detailLines = [...chunkErrors, ...parseErrors];
      toast.success(
        `Reference sync complete: ingested ${totalIngested} DCT file(s)${totalSkipped ? `; skipped ${totalSkipped} unchanged` : ''}.`,
        {
          id: toastId,
          description: detailLines.length ? detailLines.slice(0, 6).join(' · ') : undefined,
        },
      );
      await finalizeLibraryVersionUpdate({
        projectId: activeProjectId as Id<'projects'>,
        trackingMode: opts?.finalizeMode ?? trackingMode,
        referenceSignatures,
        label: libraryLabel,
        addedCount: deltaSummary.added,
        removedCount: deltaSummary.removed,
        changedCount: deltaSummary.changed,
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Sync from library failed');
    } finally {
      setSyncingLibrary(false);
    }
  };

  const handleDrsPaste = async () => {
    if (!activeProjectId || !drsText.trim()) {
      toast.error('Paste DRS JSON array first.');
      return;
    }
    try {
      const parsed = JSON.parse(drsText);
      if (!Array.isArray(parsed)) throw new Error('Root must be a JSON array');
      const entries = parsed.map((row: any) => ({
        documentNumber: String(row.documentNumber ?? row['Document Number'] ?? '').trim(),
        title: String(row.title ?? row['DCT Title'] ?? '').trim(),
        dctRevision: row.dctRevision ?? row['DCT Revision'],
        revisionDate: row.revisionDate ?? row['Revision Date'],
        peerGroupLabel: row.peerGroupLabel ?? row['Job Category/SAS Peer Group'],
        inspectorSpecialty: row.inspectorSpecialty ?? row['Inspector Specialty'],
        status: row.status ?? row.Status,
        drsUrl: row.drsUrl ?? row.url,
      }));
      const ok = entries.filter((e: any) => e.documentNumber && e.title);
      if (!ok.length) throw new Error('No valid rows (need documentNumber + title)');
      await syncDrss({
        projectId: activeProjectId as Id<'projects'>,
        entries: ok,
      });
      toast.success(`Synced ${ok.length} DRS catalog row(s).`);
      setDrsText('');
    } catch (e: any) {
      toast.error(e?.message ?? 'DRS sync failed');
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
      toast.error('Sync DCT reference documents first and wait for data to load.');
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
    let aligned = 0;
    let gap = 0;
    let mismatch = 0;
    let pending = 0;
    for (const r of enrichedList) {
      const s = r.comparison.status;
      if (s === 'aligned') aligned++;
      else if (s === 'gap') gap++;
      else if (s === 'mismatch') mismatch++;
      else pending++;
    }
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
        lastDrssyncAt: settings?.lastDrssyncAt,
      },
      findings,
      generatedAt: new Date().toISOString(),
    };
  }, [project, summary, enriched, findingsQueue.length, settings]);

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

  useEffect(() => {
    if (!activeProjectId || syncingLibrary) return;
    if (trackingMode === 'pinned') return;
    if (!(dctSharedRefs?.length && dctSharedRefs.length > 0)) return;
    const requiresInitialLoad = (summary?.docCount ?? 0) === 0;
    const librarySignatureChanged =
      !!currentLibrarySignatureKey && currentLibrarySignatureKey !== lastSyncedLibrarySignatureKey;
    if (!requiresInitialLoad && !librarySignatureChanged) return;
    const attemptKey = `${String(activeProjectId)}|${currentLibrarySignatureKey || 'none'}|${lastSyncedLibrarySignatureKey || 'none'}`;
    if (lastAutoSyncAttemptKeyRef.current === attemptKey) return;
    lastAutoSyncAttemptKeyRef.current = attemptKey;

    const refsAll = (dctSharedRefs ?? []).filter((r: any) => r.storageId);
    let refsToPrepare = refsAll;
    if (!requiresInitialLoad) {
      const baseMap = new Map<string, string>();
      for (const sig of lastSyncedSignatures) {
        const p = splitDctReferenceSignature(sig);
        baseMap.set(p.path, p.token);
      }
      refsToPrepare = refsAll.filter((ref: any) => {
        const sig = makeDctReferenceSignature(ref);
        const { path, token } = splitDctReferenceSignature(sig);
        const prev = baseMap.get(path);
        return prev === undefined || prev !== token;
      });
    }

    setAutoPrefetching(true);
    void handleSyncFromReferenceLibrary({
      finalizeMode: 'latest',
      baselineSignatures: lastSyncedSignatures,
      refsToPrepare,
      finalizeOnlyIfNothingToPrepare: true,
    }).finally(() => {
      setAutoPrefetching(false);
    });
  }, [
    activeProjectId,
    summary?.docCount,
    trackingMode,
    currentLibrarySignatureKey,
    lastSyncedLibrarySignatureKey,
    lastSyncedSignatures,
    dctSharedRefs?.length,
    syncingLibrary,
  ]);

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

  return (
    <div ref={ref} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 min-h-0 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-white to-sky-200 bg-clip-text text-transparent flex items-center gap-2">
            <FiLayers className="text-sky-400 shrink-0" />
            DCT Compliance
          </h1>
          <p className="text-white/60 mt-1 max-w-2xl">
            Pull FAA SAS DCT XML from shared reference documents, sync DRS catalog metadata, run AI traceability against your manuals, and track revision checks.
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${statusBadgeClass(displayStatus)}`}
        >
          {displayStatus === 'green' ? <FiCheckCircle /> : displayStatus === 'red' ? <FiAlertTriangle /> : <FiClock />}
          {displayStatus.toUpperCase()}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'DCT files', value: summary?.docCount ?? '—' },
          { label: 'Requirements', value: summary?.questionCount ?? '—' },
          { label: 'Applicable', value: summary?.comparisonStats?.applicableCount ?? 0 },
          { label: 'Unsure', value: summary?.comparisonStats?.unsureCount ?? 0 },
        ].map((c) => (
          <GlassCard key={c.label} className="!p-4">
            <div className="text-white/50 text-xs uppercase tracking-wide">{c.label}</div>
            <div className="text-2xl font-bold text-white mt-1">{c.value}</div>
          </GlassCard>
        ))}
      </div>
      {summary?.comparisonStats?.belowCoverageTarget ? (
        <GlassCard className="border border-amber-400/30 bg-amber-500/10">
          <p className="text-sm text-amber-100">
            Applicability coverage is {coveragePct}% (target {coverageTargetPct}%). You can still run traceability, but review the unsure pool and promote applicable DCTs.
          </p>
        </GlassCard>
      ) : null}
      {autoPrefetching ? (
        <GlassCard className="border border-sky-400/30 bg-sky-500/10">
          <p className="text-sm text-sky-100 flex items-center gap-2">
            <FiRefreshCw className="animate-spin" />
            Prefetching reference docs so traceability is ready as soon as data loads.
          </p>
        </GlassCard>
      ) : null}

      {/* Source & revision */}
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FiRefreshCw /> Source & revision
        </h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-white/80">
          <div className="space-y-3">
            <p>
              <span className="text-white/50">Last check completed:</span>{' '}
              {settings?.lastCheckCompletedAt
                ? new Date(settings.lastCheckCompletedAt).toLocaleString()
                : '—'}
            </p>
            <p>
              <span className="text-white/50">Next due:</span>{' '}
              {settings?.nextDueAt ? new Date(settings.nextDueAt).toLocaleString() : '—'}
              {summary?.overdue ? <span className="text-amber-300 ml-2">(overdue)</span> : null}
            </p>
            <p>
              <span className="text-white/50">Schedule (days):</span> {settings?.scheduleIntervalDays ?? 7}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await completeCheck({ projectId: activeProjectId as Id<'projects'> });
                  toast.success('Check completed; next due date advanced.');
                }}
              >
                Complete scheduled check
              </Button>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <span className="text-white/50">Interval</span>
                <select
                  className="bg-white/10 border border-white/20 rounded-lg px-2 py-1"
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
                    <option key={d} value={d}>
                      {d}d
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
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
              <span>
                Use <strong className="text-white/90">manual extracted text</strong> (inline excerpts from entity/regulatory/SMS docs) together with the entity profile to infer which DCTs are applicable.
              </span>
            </label>
            {useManualCorpusForApplicability && manualApplicabilityTokens.length === 0 ? (
              <p className="text-xs text-amber-200/80 pl-6">
                No inline extracted text found in merged manuals yet—extract documents in Library or disable this option.
              </p>
            ) : useManualCorpusForApplicability ? (
              <p className="text-xs text-white/40 pl-6">
                Heuristic tokens from manuals: {manualApplicabilityTokens.join(', ') || '—'}
              </p>
            ) : null}
            <div>
              <span className="text-white/50 block mb-1">Applicability mode</span>
              <select
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                value={applicabilityMode}
                onChange={(e) => setApplicabilityMode(e.target.value as 'heuristics_only' | 'structured_preferred')}
              >
                <option value="structured_preferred">Structured preferred (ratings/capabilities, then heuristics)</option>
                <option value="heuristics_only">Heuristics only (ignore structured selectors)</option>
              </select>
            </div>
            <div>
              <span className="text-white/50 block mb-1">Include substrings (comma)</span>
              <input
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                placeholder="e.g. 145, repair"
                value={includeOverride}
                onChange={(e) => setIncludeOverride(e.target.value)}
              />
            </div>
            <div>
              <span className="text-white/50 block mb-1">Exclude substrings (comma)</span>
              <input
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                placeholder="e.g. 121, airline"
                value={excludeOverride}
                onChange={(e) => setExcludeOverride(e.target.value)}
              />
            </div>
            <Button variant="secondary" className="mt-2" onClick={() => void handleSaveApplicability()}>
              Save applicability filters
            </Button>
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
              <p className="text-white/60 text-xs uppercase tracking-wide">DCT library versioning</p>
              <label className="block">
                <span className="text-white/50 text-xs">Tracking mode</span>
                <select
                  className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                  value={trackingMode}
                  onChange={async (e) => {
                    const nextMode = e.target.value as 'latest' | 'pinned';
                    if (!activeProjectId) return;
                    if (nextMode === 'pinned') {
                      await finalizeLibraryVersionUpdate({
                        projectId: activeProjectId as Id<'projects'>,
                        trackingMode: 'pinned',
                        referenceSignatures: currentLibrarySnapshot.signatures,
                        label: currentLibrarySnapshot.label,
                        addedCount: 0,
                        removedCount: 0,
                        changedCount: 0,
                      });
                      toast.success('Library version pinned to current snapshot.');
                      return;
                    }
                    await upsertDctProjectSettings({
                      projectId: activeProjectId as Id<'projects'>,
                      dctLibraryTrackingMode: 'latest',
                    } as any);
                    toast.success('Now following latest library updates.');
                  }}
                >
                  <option value="latest">Latest (auto-follow)</option>
                  <option value="pinned">Pinned (controlled updates)</option>
                </select>
              </label>
              <p className="text-xs text-white/40">
                Current snapshot: {currentLibrarySnapshot.label}
              </p>
              {trackingMode === 'pinned' ? (
                <p className="text-xs text-white/40">
                  Pinned snapshot: {String(settings?.pinnedDctLibraryLabel ?? 'not set')}
                </p>
              ) : null}
              {trackingMode === 'pinned' && hasLibraryDeltaPreview ? (
                <p className="text-xs text-amber-200/90">
                  Impact preview vs pinned: +{libraryDeltaPreview.added} added, -{libraryDeltaPreview.removed} removed, ~{libraryDeltaPreview.changed} changed.
                </p>
              ) : null}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
              <p className="text-white/60 text-xs uppercase tracking-wide">Structured selectors</p>
              <div className="max-h-28 overflow-auto rounded border border-white/10 p-2 space-y-1">
                <p className="text-white/45 text-xs">Class ratings</p>
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
              <div className="max-h-28 overflow-auto rounded border border-white/10 p-2 space-y-1">
                <p className="text-white/45 text-xs">Capability list items</p>
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
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <FiLayers /> Sync from reference library
            </h3>
            <p className="text-xs text-white/50 mb-2">
              Shared <code className="text-sky-300/80">faa_sas_dct</code> documents from Reference Documents (global or company-scoped) are fetched, parsed, and ingested into this project.
            </p>
            <p className="text-xs text-white/40 mb-2">
              Library files: <span className="text-white/70">{dctSharedRefs?.length ?? 0}</span>
            </p>
            <Button
              variant="secondary"
              disabled={syncingLibrary}
              onClick={() =>
                void handleSyncFromReferenceLibrary({
                  finalizeMode: trackingMode === 'pinned' ? 'pinned' : 'latest',
                  baselineSignatures,
                })
              }
            >
              {syncingLibrary
                ? (autoPrefetching ? 'Prefetching…' : 'Syncing…')
                : trackingMode === 'pinned'
                  ? 'Update to latest (sync + pin)'
                  : 'Sync from library'}
            </Button>
            {trackingMode === 'pinned' && hasLibraryDeltaPreview ? (
              <p className="text-xs text-amber-200/90 mt-2">
                Pending library update: +{libraryDeltaPreview.added}, -{libraryDeltaPreview.removed}, ~{libraryDeltaPreview.changed}.
              </p>
            ) : null}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">DRS catalog (JSON)</h3>
            <p className="text-xs text-white/50 mb-2">
              Paste a JSON array of rows with documentNumber & title (alias DRS column names supported).{' '}
              <a
                className="text-sky-400 underline"
                href="https://drs.faa.gov/browse/SAS_DCT/doctypeDetails"
                target="_blank"
                rel="noreferrer"
              >
                Open DRS
              </a>
            </p>
            <textarea
              className="w-full h-28 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs font-mono"
              placeholder='[{"documentNumber":"...","title":"..."}]'
              value={drsText}
              onChange={(e) => setDrsText(e.target.value)}
            />
            <Button className="mt-2" variant="secondary" onClick={() => void handleDrsPaste()}>
              Sync catalog rows
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Traceability */}
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <FiZap /> AI traceability
        </h2>
        <p className="text-sm text-white/60 mb-4">
          Uses manuals with extracted text (entity, regulatory, SMS, uploaded). Choose traceability perspective and model,
          then run against applicable DCT questions and low-confidence unsure items.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-white/70 whitespace-nowrap">Perspective</span>
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
              className="h-11 px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-sky-light transition-colors min-w-[100px] max-w-full sm:min-w-[160px] sm:max-w-[240px] disabled:opacity-50"
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
          <PageModelSelector field="dctTraceabilityModel" compact disabled={traceRunning} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleRunTraceability()} disabled={traceRunning}>
            {traceRunning ? 'Running…' : 'Run traceability (applicable DCTs)'}
          </Button>
        </div>
      </GlassCard>

      {/* Matrix */}
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4">Traceability matrix</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            className="flex-1 min-w-[200px] bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Filter text…"
            value={matrixFilter}
            onChange={(e) => setMatrixFilter(e.target.value)}
          />
          <select
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
            value={matrixStatus}
            onChange={(e) => setMatrixStatus(e.target.value)}
          >
            {['all', 'pending', 'aligned', 'gap', 'mismatch'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
            value={matrixApplicability}
            onChange={(e) => setMatrixApplicability(e.target.value as 'all' | DctApplicabilityState)}
          >
            {['all', 'applicable', 'unsure', 'not_applicable'].map((s) => (
              <option key={s} value={s}>
                applicability: {s}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-lg border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-white/5 sticky top-0">
              <tr>
                <th className="p-2 text-white/60">DCT</th>
                <th className="p-2 text-white/60">Requirement</th>
                <th className="p-2 text-white/60">Status</th>
                <th className="p-2 text-white/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 200).map((row) => (
                <tr key={row.comparison._id} className="border-t border-white/5">
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
                        <option key={s} value={s}>
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
                        <option key={s} value={s}>
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
            </tbody>
          </table>
          {filteredRows.length > 200 ? (
            <p className="p-2 text-white/40 text-xs">Showing first 200 rows — narrow filters to see more.</p>
          ) : null}
        </div>
      </GlassCard>

      {/* Findings */}
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FiAlertTriangle /> Findings queue
        </h2>
        {findingsQueue.length === 0 ? (
          <p className="text-white/50 text-sm">No open gaps or mismatches.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {findingsQueue.slice(0, 30).map((row) => (
              <li key={row.comparison._id} className="border border-white/10 rounded-lg p-3">
                <div className="text-white/60 text-xs">{row.dctDocument.fileName}</div>
                <div className="text-white mt-1">{row.question.text}</div>
                {row.comparison.rationale ? (
                  <div className="text-white/50 mt-1 text-xs">{row.comparison.rationale}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4">Unsure applicability pool</h2>
        {!unsureRows.length ? (
          <p className="text-white/50 text-sm">No unsure DCTs right now.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {unsureRows.slice(0, 30).map((row) => (
              <li key={row.comparison._id} className="border border-white/10 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-white/60 text-xs">{row.dctDocument.fileName}</div>
                  <div className="text-white mt-1">{row.question.text}</div>
                </div>
                <Button
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
                  Add to applicable
                </Button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* DRS reference library */}
      {catalog && catalog.length > 0 ? (
        <GlassCard>
          <h2 className="text-lg font-semibold text-white mb-4">DRS catalog — add to company references</h2>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="text-white/50">
                  <th className="p-2 w-8" />
                  <th className="p-2">Doc #</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Rev</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((row) => (
                  <tr key={row._id} className="border-t border-white/5">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!selectedCatalog[row.documentNumber]}
                        onChange={(e) =>
                          setSelectedCatalog((prev) => ({ ...prev, [row.documentNumber]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="p-2">{row.documentNumber}</td>
                    <td className="p-2">{row.title}</td>
                    <td className="p-2">{row.dctRevision ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={!companyId}
            onClick={async () => {
              if (!activeProjectId || !companyId) return;
              const sel = catalog.filter((r) => selectedCatalog[r.documentNumber]);
              if (!sel.length) {
                toast.error('Select at least one row');
                return;
              }
              await addRefs({
                projectId: activeProjectId as Id<'projects'>,
                companyId,
                entries: sel.map((r) => ({
                  documentNumber: r.documentNumber,
                  title: r.title,
                  dctRevision: r.dctRevision,
                  revisionDate: r.revisionDate,
                  drsUrl: r.drsUrl,
                })),
              });
              toast.success('Added to shared reference library');
            }}
          >
            Add selected to company references
          </Button>
          {!companyId ? <p className="text-xs text-amber-200/80 mt-2">Project has no company — cannot add references.</p> : null}
        </GlassCard>
      ) : null}

      {/* Reports */}
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FiDownload /> Reports
        </h2>
        <div className="flex flex-wrap gap-2 mb-6">
          <Button variant="secondary" onClick={() => void handlePdf()}>
            Download PDF
          </Button>
          <Button variant="secondary" onClick={() => void handlePersistReport()}>
            Save snapshot to history
          </Button>
        </div>
        <h3 className="text-sm text-white/60 mb-2">History</h3>
        <ul className="text-sm space-y-2 text-white/80">
          {(reports ?? []).map((r) => (
            <li key={r._id} className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <span>{r.title}</span>
              <span className="text-white/40 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</span>
            </li>
          ))}
          {!reports?.length ? <li className="text-white/40">No saved reports yet.</li> : null}
        </ul>
      </GlassCard>

      {/* Revision log */}
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-2">DCT library version history</h2>
        <p className="text-xs text-white/50 mb-3">
          Recorded pin/update events for reproducible DCT baseline tracking.
        </p>
        <div className="text-xs text-white/70 mb-3">
          <span className="text-white/40">Mode:</span> {trackingMode.toUpperCase()}
          {trackingMode === 'pinned' ? (
            <>
              {' '}
              <span className="text-white/40">| Pinned:</span>{' '}
              {String(settings?.pinnedDctLibraryLabel ?? 'not set')}
            </>
          ) : null}
        </div>
        <ul className="text-xs text-white/70 space-y-2 max-h-48 overflow-y-auto">
          {libraryVersionEvents.map((event) => (
            <li key={event._id} className="border-b border-white/5 pb-2">
              <div>{event.summary}</div>
              <div className="text-white/30 mt-0.5">
                {event.startedAt ? new Date(event.startedAt).toLocaleString() : ''}
              </div>
            </li>
          ))}
          {!libraryVersionEvents.length ? (
            <li className="text-white/40">No library version updates recorded yet.</li>
          ) : null}
        </ul>
      </GlassCard>

      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4">Revision checks</h2>
        <ul className="text-xs text-white/70 space-y-2 max-h-48 overflow-y-auto">
          {(revisions ?? []).map((r) => (
            <li key={r._id}>
              <span className="text-white/40">{r.kind}</span> — {r.summary}{' '}
              <span className="text-white/30">
                {r.startedAt ? new Date(r.startedAt).toLocaleString() : ''}
              </span>
            </li>
          ))}
          {!revisions?.length ? <li className="text-white/40">No runs yet.</li> : null}
        </ul>
      </GlassCard>
    </div>
  );
}
