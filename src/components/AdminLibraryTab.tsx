import { useMemo, useState } from 'react';
import {
  FiUpload, FiTrash2, FiFile, FiFolder, FiFileText, FiCheckCircle, FiBook, FiRefreshCw,
  FiPackage, FiClipboard, FiZap, FiAlertTriangle, FiClock, FiCheck,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, GlassCard, Badge } from './ui';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useDocumentsByCompany,
  useAddDocument,
  useRemoveDocument,
  useClearDocuments,
  useProjects,
  useGenerateUploadUrl,
  useDefaultClaudeModel,
  useSharedAgentDocsByAgents,
  useAllProjectAgentDocs,
  useReindexOneDocument,
  useUpdateDocumentCategory,
  useCreateTechnicalPublication,
} from '../hooks/useConvexData';
import { useIndexSummary } from '../hooks/useIndexSummary';
import { AUDIT_AGENTS } from '../data/auditAgentDefinitions';
import { AGENT_TYPES } from '../config/adminAgentTypes';
import { DocumentExtractor } from '../services/documentExtractor';
import { getConvexErrorMessage } from '../utils/convexError';

export type LibrarySubTab =
  | 'regulatory'
  | 'sms'
  | 'reference'
  | 'uploaded'
  | 'maintenance_manual'
  | 'parts_catalog'
  | 'logbook_scan'
  | 'wiring_diagram';

const ALL_RECATEGORIZE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'sms', label: 'SMS' },
  { value: 'reference', label: 'Reference' },
  { value: 'entity', label: 'Entity' },
  { value: 'maintenance_manual', label: 'Maintenance Manual' },
  { value: 'parts_catalog', label: 'Parts Catalog' },
  { value: 'logbook_scan', label: 'Logbook Scan' },
  { value: 'wiring_diagram', label: 'Wiring Diagram' },
  { value: 'mel', label: 'MEL' },
];

function suggestCategoryFromFilename(name: string): LibrarySubTab | null {
  const n = name.toLowerCase();
  if (/\b(amm|mm|maintenance[\s_-]*manual|smm)\b/.test(n)) return 'maintenance_manual';
  if (/\b(ipc|parts[\s_-]*catalog|illustrated[\s_-]*parts)\b/.test(n)) return 'parts_catalog';
  if (/\b(wiring|wd|schematic|electrical)\b/.test(n)) return 'wiring_diagram';
  if (/\b(logbook|log[\s_-]*book|aircraft[\s_-]*log)\b/.test(n)) return 'logbook_scan';
  if (/\b(sms|safety[\s_-]*management)\b/.test(n)) return 'sms';
  if (/\b(14[\s_-]*cfr|far[\s_-]*\d|easa|advisory[\s_-]*circular|ac[\s_-]*\d)\b/.test(n)) return 'regulatory';
  return null;
}

function asConvexArray<T = any>(v: T[] | undefined | null | unknown): T[] {
  return Array.isArray(v) ? v : [];
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

interface Props {
  adminScopeCompanyId: string | undefined;
  librarySubTab: LibrarySubTab;
  onSetLibrarySubTab: (t: LibrarySubTab) => void;
}

export default function AdminLibraryTab({ adminScopeCompanyId, librarySubTab, onSetLibrarySubTab }: Props) {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const projects = asConvexArray(useProjects());

  const regulatoryByCompany = useDocumentsByCompany(adminScopeCompanyId, 'regulatory');
  const smsByCompany = useDocumentsByCompany(adminScopeCompanyId, 'sms');
  const referenceByCompany = useDocumentsByCompany(adminScopeCompanyId, 'reference');
  const uploadedByCompany = useDocumentsByCompany(adminScopeCompanyId, 'uploaded');
  const maintenanceByCompany = useDocumentsByCompany(adminScopeCompanyId, 'maintenance_manual');
  const partsByCompany = useDocumentsByCompany(adminScopeCompanyId, 'parts_catalog');
  const logbookScanByCompany = useDocumentsByCompany(adminScopeCompanyId, 'logbook_scan');
  const wiringByCompany = useDocumentsByCompany(adminScopeCompanyId, 'wiring_diagram');
  const regulatoryByProject = useDocuments(activeProjectId || undefined, 'regulatory');
  const smsByProject = useDocuments(activeProjectId || undefined, 'sms');
  const referenceByProject = useDocuments(activeProjectId || undefined, 'reference');
  const uploadedByProject = useDocuments(activeProjectId || undefined, 'uploaded');
  const maintenanceByProject = useDocuments(activeProjectId || undefined, 'maintenance_manual');
  const partsByProject = useDocuments(activeProjectId || undefined, 'parts_catalog');
  const logbookScanByProject = useDocuments(activeProjectId || undefined, 'logbook_scan');
  const wiringByProject = useDocuments(activeProjectId || undefined, 'wiring_diagram');

  const regulatoryFiles = asConvexArray(adminScopeCompanyId ? regulatoryByCompany : regulatoryByProject);
  const smsDocuments = asConvexArray(adminScopeCompanyId ? smsByCompany : smsByProject);
  const referenceDocuments = asConvexArray(adminScopeCompanyId ? referenceByCompany : referenceByProject);
  const uploadedDocuments = asConvexArray(adminScopeCompanyId ? uploadedByCompany : uploadedByProject);
  const maintenanceDocs = asConvexArray(adminScopeCompanyId ? maintenanceByCompany : maintenanceByProject);
  const partsDocs = asConvexArray(adminScopeCompanyId ? partsByCompany : partsByProject);
  const logbookScanDocs = asConvexArray(adminScopeCompanyId ? logbookScanByCompany : logbookScanByProject);
  const wiringDocs = asConvexArray(adminScopeCompanyId ? wiringByCompany : wiringByProject);

  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();
  const clearDocuments = useClearDocuments();
  const generateUploadUrl = useGenerateUploadUrl();
  const defaultModel = useDefaultClaudeModel();
  const backfillDocumentChunks = useAction((api as any).documentChunks.backfillAll);
  const reindexOne = useReindexOneDocument();
  const updateCategory = useUpdateDocumentCategory();
  const createPublication = useCreateTechnicalPublication();
  const [isReindexingLibrary, setIsReindexingLibrary] = useState(false);
  const [reindexingDocIds, setReindexingDocIds] = useState<Set<string>>(new Set());
  const [recategorizingIds, setRecategorizingIds] = useState<Set<string>>(new Set());

  const { summary: indexSummary, refetch: refetchIndexSummary } = useIndexSummary(
    adminScopeCompanyId
      ? { companyId: adminScopeCompanyId as any }
      : { projectId: (activeProjectId as any) ?? null },
  );

  const indexStateByDocId = useMemo(() => {
    const m = new Map<string, { state?: string; chunkCount?: number; lastError?: string; reason?: string }>();
    for (const d of indexSummary?.perDoc || []) {
      m.set(String(d.documentId), {
        state: d.state,
        chunkCount: d.chunkCount,
        lastError: d.lastError,
        reason: d.reason,
      });
    }
    return m;
  }, [indexSummary]);

  const kbAgentIds = AUDIT_AGENTS.map((a) => a.id);
  const sharedKbDocs = asConvexArray(useSharedAgentDocsByAgents(kbAgentIds, adminScopeCompanyId));
  const projectKbDocs = asConvexArray(useAllProjectAgentDocs(activeProjectId || undefined));
  const allKbDocsForReference = useMemo(() => {
    const shared = sharedKbDocs.filter((d: any) => (d.extractedText || '').length > 0);
    const project = projectKbDocs.filter((d: any) => (d.extractedText || '').length > 0);
    return [...shared, ...project];
  }, [sharedKbDocs, projectKbDocs]);

  const libraryTargetProjectId = useMemo(() => {
    if (!adminScopeCompanyId) return activeProjectId;
    const inCompany = activeProjectId && projects.some((p: any) =>
      String(p._id) === String(activeProjectId) && String(p.companyId) === String(adminScopeCompanyId)
    );
    if (inCompany) return activeProjectId;
    const first = projects.find((p: any) => String(p.companyId) === String(adminScopeCompanyId));
    return first?._id ?? null;
  }, [adminScopeCompanyId, activeProjectId, projects]);

  const handleLibraryImport = async (category: LibrarySubTab, files: File[]) => {
    if (!libraryTargetProjectId || files.length === 0) {
      toast.error(adminScopeCompanyId ? 'No project found for this company. Create one in the sidebar.' : 'Select a project first.');
      return;
    }
    const extractor = new DocumentExtractor();
    const isPublicationCategory =
      category === 'maintenance_manual' ||
      category === 'parts_catalog' ||
      category === 'logbook_scan' ||
      category === 'wiring_diagram';

    let suggestions = 0;

    for (const file of files) {
      const suggested = category === 'uploaded' ? suggestCategoryFromFilename(file.name) : null;
      if (suggested) suggestions += 1;

      let extractedText = '';
      let extractionMeta: { backend: string; confidence?: number } | undefined;
      let storageId: any = undefined;
      try {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        const uploadJson = await uploadResult.json();
        storageId = uploadJson.storageId;
      } catch { /* storage optional */ }
      try {
        const buffer = await file.arrayBuffer();
        const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
        extractedText = extracted.text;
        extractionMeta = extracted.metadata;
      } catch (err: any) {
        toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
      }
      const documentId = await addDocument({
        projectId: libraryTargetProjectId as any,
        category,
        name: file.name,
        path: file.name,
        source: 'local',
        mimeType: file.type || undefined,
        size: file.size,
        storageId,
        extractedText: extractedText || undefined,
        extractionMeta,
        extractedAt: new Date().toISOString(),
      } as any);

      if (isPublicationCategory && adminScopeCompanyId && documentId) {
        try {
          const pubType =
            category === 'maintenance_manual' ? 'maintenance_manual'
            : category === 'parts_catalog' ? 'parts_catalog'
            : category === 'wiring_diagram' ? 'wiring_diagram'
            : 'logbook_scan';
          await createPublication({
            companyId: adminScopeCompanyId as any,
            projectId: libraryTargetProjectId as any,
            documentId: documentId as any,
            title: file.name.replace(/\.[^.]+$/, ''),
            publicationType: pubType as any,
          } as any);
        } catch (err: any) {
          toast.warning(`Could not register publication metadata for ${file.name}`, { description: err?.message });
        }
      }
    }
    const labelMap: Record<string, string> = {
      regulatory: 'regulatory',
      sms: 'SMS',
      reference: 'reference',
      uploaded: 'uploaded',
      maintenance_manual: 'maintenance manual',
      parts_catalog: 'parts catalog',
      logbook_scan: 'logbook scan',
      wiring_diagram: 'wiring diagram',
    };
    const label = labelMap[category] || category;
    toast.success(`Added ${files.length} ${label} document${files.length !== 1 ? 's' : ''}`, {
      description:
        suggestions > 0
          ? `${suggestions} file${suggestions !== 1 ? 's' : ''} look like a different category — use the dropdown on each row to recategorize.`
          : undefined,
      duration: suggestions > 0 ? 8000 : undefined,
    });
    void refetchIndexSummary();
  };

  const handleReindexDoc = async (docId: string) => {
    setReindexingDocIds((prev) => {
      const next = new Set(prev);
      next.add(String(docId));
      return next;
    });
    try {
      await reindexOne({ documentId: docId as any });
      toast.success('Reindex queued — refreshing status…');
      await refetchIndexSummary();
    } catch (error) {
      toast.error(getConvexErrorMessage(error) || 'Could not reindex document.');
    } finally {
      setReindexingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(String(docId));
        return next;
      });
    }
  };

  const handleRecategorize = async (docId: string, newCategory: string, currentCategory?: string) => {
    if (!newCategory || newCategory === currentCategory) return;
    setRecategorizingIds((prev) => {
      const next = new Set(prev);
      next.add(String(docId));
      return next;
    });
    try {
      await updateCategory({ documentId: docId as any, category: newCategory });
      toast.success(`Recategorized to ${newCategory} — reindexing.`);
      await refetchIndexSummary();
    } catch (error) {
      toast.error(getConvexErrorMessage(error) || 'Could not change category.');
    } finally {
      setRecategorizingIds((prev) => {
        const next = new Set(prev);
        next.delete(String(docId));
        return next;
      });
    }
  };

  const handleLibraryDelete = (docId: string) => {
    if (confirm('Remove this document?')) removeDocument({ documentId: docId as any });
  };

  const handleReindexCompanyDocuments = async () => {
    if (!libraryTargetProjectId) {
      toast.error('Select an active project before reindexing.');
      return;
    }
    setIsReindexingLibrary(true);
    try {
      const result = (await backfillDocumentChunks({ projectId: libraryTargetProjectId as any })) as {
        queued?: number;
        total?: number;
        skippedNoText?: number;
        skippedCategory?: number;
        skippedCategoryNames?: Array<{ name: string; category: string }>;
        queuedByCategory?: Record<string, number>;
      };
      const queued = Number(result?.queued || 0);
      const total = Number(result?.total || 0);
      const skippedNoText = Number(result?.skippedNoText || 0);
      const skippedCategory = Number(result?.skippedCategory || 0);
      const byCat = result?.queuedByCategory || {};
      const catSummary = Object.entries(byCat)
        .map(([cat, n]) => `${cat}: ${n}`)
        .join(', ');
      const skippedSample = (result?.skippedCategoryNames || [])
        .slice(0, 5)
        .map((d) => `${d.name} (${d.category})`)
        .join('; ');
      toast.success(
        `Queued ${queued} of ${total} documents${catSummary ? ` — ${catSummary}` : ''}`,
        {
          description:
            skippedNoText + skippedCategory > 0
              ? `Skipped ${skippedNoText} (no text) + ${skippedCategory} (unsupported category)${
                  skippedSample ? `. Examples: ${skippedSample}` : ''
                }`
              : undefined,
          duration: 10000,
        },
      );
    } catch (error) {
      toast.error(getConvexErrorMessage(error) || 'Could not queue document reindex.');
    } finally {
      setIsReindexingLibrary(false);
    }
  };

  const handleAddKbDocAsProjectReference = async (kbDoc: { name: string; path?: string; extractedText?: string }) => {
    if (!libraryTargetProjectId) return;
    await addDocument({
      projectId: libraryTargetProjectId as any,
      category: 'reference',
      name: kbDoc.name,
      path: kbDoc.path || kbDoc.name,
      source: 'knowledge-base',
      extractedText: kbDoc.extractedText ?? '',
      extractedAt: new Date().toISOString(),
    });
    toast.success('Added as project reference');
  };

  const indexedCount = indexSummary?.indexed ?? 0;
  const totalDocs = indexSummary?.totalDocs ?? 0;
  const failedCount = indexSummary?.failed ?? 0;
  const inFlightCount = indexSummary?.inFlight ?? 0;
  const totalChunks = indexSummary?.totalChunks ?? 0;

  return (
    <div className="space-y-4">
      <div className="mb-4 p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
        <p className="text-sm text-sky-300/90">
          Manage project library across every category: regulatory, SMS, reference, uploaded, maintenance manuals, parts catalogs, logbook scans, wiring diagrams
          {adminScopeCompanyId ? ' (all projects in this tenant shown below)' : ''}. Entity documents are managed on the main <strong>Library</strong> page.
        </p>
      </div>
      {(totalDocs > 0 || failedCount > 0) && (
        <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded-xl flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="text-white/80 font-medium">Index health:</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <FiCheck /> {indexedCount} indexed
          </span>
          {inFlightCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <FiClock /> {inFlightCount} pending
            </span>
          )}
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-red-300">
              <FiAlertTriangle /> {failedCount} failed
            </span>
          )}
          <span className="text-white/50">· {totalDocs} total documents · {totalChunks} chunks</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-white/70 text-sm">Active project for imports:</span>
        <select
          value={activeProjectId ?? ''}
          onChange={(e) => setActiveProjectId(e.target.value || null)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-light/50"
        >
          <option value="">Select project</option>
          {(adminScopeCompanyId
            ? projects.filter((p: any) => String(p.companyId) === String(adminScopeCompanyId))
            : projects
          ).map((p: any) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleReindexCompanyDocuments}
          disabled={!libraryTargetProjectId || isReindexingLibrary}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            !libraryTargetProjectId || isReindexingLibrary
              ? 'cursor-not-allowed bg-white/5 text-white/40'
              : 'bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
          }`}
        >
          <FiRefreshCw className={isReindexingLibrary ? 'animate-spin' : ''} />
          {isReindexingLibrary ? 'Reindexing...' : 'Reindex company documents'}
        </button>
        <span className="text-xs text-white/50">
          Rebuilds vector search chunks so splash search can pull relevant GMM/manual passages.
        </span>
      </div>
      {libraryTargetProjectId && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {(['regulatory', 'sms', 'reference', 'uploaded', 'maintenance_manual', 'parts_catalog', 'logbook_scan', 'wiring_diagram'] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => onSetLibrarySubTab(sub)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${librarySubTab === sub ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                {sub === 'regulatory' && <><FiFolder className="inline mr-1.5" />Regulatory</>}
                {sub === 'sms' && <><FiFileText className="inline mr-1.5" />SMS</>}
                {sub === 'reference' && <><FiCheckCircle className="inline mr-1.5" />Reference</>}
                {sub === 'uploaded' && <><FiUpload className="inline mr-1.5" />Uploaded</>}
                {sub === 'maintenance_manual' && <><FiBook className="inline mr-1.5" />Manuals</>}
                {sub === 'parts_catalog' && <><FiPackage className="inline mr-1.5" />Parts</>}
                {sub === 'logbook_scan' && <><FiClipboard className="inline mr-1.5" />Logbook Scans</>}
                {sub === 'wiring_diagram' && <><FiZap className="inline mr-1.5" />Wiring</>}
              </button>
            ))}
          </div>
          <GlassCard className="mb-4">
            <h3 className="text-lg font-display font-bold mb-3">
              {librarySubTab === 'regulatory' && 'Import Regulatory'}
              {librarySubTab === 'sms' && 'Import SMS Data'}
              {librarySubTab === 'reference' && 'Import Reference (known good)'}
              {librarySubTab === 'uploaded' && 'Upload Documents'}
              {librarySubTab === 'maintenance_manual' && 'Import Maintenance Manuals'}
              {librarySubTab === 'parts_catalog' && 'Import Parts Catalogs'}
              {librarySubTab === 'logbook_scan' && 'Import Logbook Scans'}
              {librarySubTab === 'wiring_diagram' && 'Import Wiring Diagrams'}
            </h3>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-sky/10 text-sky-lighter hover:bg-sky/20 cursor-pointer transition-colors">
              <FiUpload />
              Choose files
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.xml,.js,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) handleLibraryImport(librarySubTab, files);
                  e.target.value = '';
                }}
              />
            </label>
          </GlassCard>
          {librarySubTab === 'reference' && allKbDocsForReference.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="text-lg font-display font-bold mb-2 flex items-center gap-2">
                <FiBook className="text-amber-400" />
                Add from Knowledge Base
              </h3>
              <p className="text-sm text-white/70 mb-2">Use shared or project agent docs as reference standards.</p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                {allKbDocsForReference.slice(0, 20).map((doc: any) => (
                  <div key={`${doc.agentId || 'shared'}-${doc._id}`} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                    <span className="text-sm truncate flex-1">
                      {doc.name}
                      {doc.agentId && (
                        <span className="text-white/50 text-xs ml-1">
                          ({AGENT_TYPES.find((a) => a.id === doc.agentId)?.name || doc.agentId})
                        </span>
                      )}
                    </span>
                    <Button variant="warning" size="sm" onClick={() => handleAddKbDocAsProjectReference(doc)}>Add as reference</Button>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
          {(() => {
            const listMap: Record<LibrarySubTab, any[]> = {
              regulatory: regulatoryFiles,
              sms: smsDocuments,
              reference: referenceDocuments,
              uploaded: uploadedDocuments,
              maintenance_manual: maintenanceDocs,
              parts_catalog: partsDocs,
              logbook_scan: logbookScanDocs,
              wiring_diagram: wiringDocs,
            };
            const titleMap: Record<LibrarySubTab, string> = {
              regulatory: 'Regulatory',
              sms: 'SMS Data',
              reference: 'Reference',
              uploaded: 'Uploaded',
              maintenance_manual: 'Maintenance Manuals',
              parts_catalog: 'Parts Catalogs',
              logbook_scan: 'Logbook Scans',
              wiring_diagram: 'Wiring Diagrams',
            };
            const list = listMap[librarySubTab] || [];
            return (
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-bold">
                    {titleMap[librarySubTab]} ({list.length})
                  </h3>
                  {librarySubTab === 'uploaded' && list.length > 0 && (
                    <button
                      onClick={() => { if (confirm('Clear all uploaded documents for the active import project?')) clearDocuments({ projectId: libraryTargetProjectId as any, category: 'uploaded' }); }}
                      className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10 rounded-lg"
                    >
                      Clear all (active project)
                    </button>
                  )}
                </div>
                {list.length === 0 ? (
                  <p className="text-white/60 text-sm py-6">No documents in this category.</p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
                    {list.map((doc: any) => {
                      const status = indexStateByDocId.get(String(doc._id));
                      const state = status?.state;
                      const chunkCount = status?.chunkCount ?? 0;
                      const isReindexing = reindexingDocIds.has(String(doc._id));
                      const isRecategorizing = recategorizingIds.has(String(doc._id));
                      return (
                        <div key={doc._id} className="flex flex-col gap-2 p-3 bg-white/5 rounded-lg group sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <FiFile className="text-white/70 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{doc.name}</div>
                              <div className="text-xs text-white/60 flex flex-wrap items-center gap-2 mt-0.5">
                                {state === 'indexed' && (
                                  <span className="inline-flex items-center gap-1 text-emerald-300">
                                    <FiCheck className="w-3 h-3" /> {chunkCount} chunks
                                  </span>
                                )}
                                {state === 'failed' && (
                                  <span className="inline-flex items-center gap-1 text-red-300" title={status?.lastError || ''}>
                                    <FiAlertTriangle className="w-3 h-3" /> failed
                                  </span>
                                )}
                                {state === 'inFlight' && (
                                  <span className="inline-flex items-center gap-1 text-amber-300">
                                    <FiClock className="w-3 h-3" /> pending
                                  </span>
                                )}
                                {state === 'eligible' && (
                                  <span className="inline-flex items-center gap-1 text-sky-300">
                                    <FiClock className="w-3 h-3" /> not yet indexed
                                  </span>
                                )}
                                {state === 'skipped' && (
                                  <span className="inline-flex items-center gap-1 text-white/40" title={status?.reason || ''}>
                                    · skipped
                                  </span>
                                )}
                                {!state && doc.category && <Badge>{doc.category}</Badge>}
                                <span>{formatFileSize(doc.size)}</span>
                                {doc.extractedAt && <span>{new Date(doc.extractedAt).toLocaleDateString()}</span>}
                                {doc.projectName && <span className="text-white/40">· {doc.projectName}</span>}
                              </div>
                              {state === 'failed' && status?.lastError && (
                                <div className="text-xs text-red-300/80 mt-1 truncate" title={status.lastError}>{status.lastError}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select
                              value={doc.category || ''}
                              onChange={(e) => handleRecategorize(doc._id, e.target.value, doc.category)}
                              disabled={isRecategorizing}
                              title="Change category (re-runs indexing)"
                              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-sky-light/50 disabled:opacity-50"
                            >
                              {ALL_RECATEGORIZE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleReindexDoc(doc._id)}
                              disabled={isReindexing}
                              title="Reindex this document"
                              className="p-1.5 text-white/70 hover:text-sky-light hover:bg-sky-light/10 rounded disabled:opacity-50"
                            >
                              <FiRefreshCw className={`w-4 h-4 ${isReindexing ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleLibraryDelete(doc._id)}
                              className="p-1.5 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            );
          })()}
        </>
      )}
      {!activeProjectId && (
        <GlassCard>
          <p className="text-white/60 py-6">Select a project above to manage its library.</p>
        </GlassCard>
      )}
    </div>
  );
}
