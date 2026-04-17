import { useMemo, useState } from 'react';
import { FiUpload, FiTrash2, FiFile, FiFolder, FiFileText, FiCheckCircle, FiBook, FiRefreshCw } from 'react-icons/fi';
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
} from '../hooks/useConvexData';
import { AUDIT_AGENTS } from '../data/auditAgentDefinitions';
import { AGENT_TYPES } from '../config/adminAgentTypes';
import { DocumentExtractor } from '../services/documentExtractor';
import { getConvexErrorMessage } from '../utils/convexError';

export type LibrarySubTab = 'regulatory' | 'sms' | 'reference' | 'uploaded';

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
  const regulatoryByProject = useDocuments(activeProjectId || undefined, 'regulatory');
  const smsByProject = useDocuments(activeProjectId || undefined, 'sms');
  const referenceByProject = useDocuments(activeProjectId || undefined, 'reference');
  const uploadedByProject = useDocuments(activeProjectId || undefined, 'uploaded');

  const regulatoryFiles = asConvexArray(adminScopeCompanyId ? regulatoryByCompany : regulatoryByProject);
  const smsDocuments = asConvexArray(adminScopeCompanyId ? smsByCompany : smsByProject);
  const referenceDocuments = asConvexArray(adminScopeCompanyId ? referenceByCompany : referenceByProject);
  const uploadedDocuments = asConvexArray(adminScopeCompanyId ? uploadedByCompany : uploadedByProject);

  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();
  const clearDocuments = useClearDocuments();
  const generateUploadUrl = useGenerateUploadUrl();
  const defaultModel = useDefaultClaudeModel();
  const backfillDocumentChunks = useAction((api as any).documentChunks.backfillAll);
  const [isReindexingLibrary, setIsReindexingLibrary] = useState(false);

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
    for (const file of files) {
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
      await addDocument({
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
    }
    const label = category === 'regulatory' ? 'regulatory' : category === 'sms' ? 'SMS' : category === 'reference' ? 'reference' : 'uploaded';
    toast.success(`Added ${files.length} ${label} document${files.length !== 1 ? 's' : ''}`);
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
      const result = await backfillDocumentChunks({ projectId: libraryTargetProjectId as any }) as { queued?: number };
      const queued = Number(result?.queued || 0);
      toast.success(`Queued indexing for ${queued} document${queued === 1 ? '' : 's'}.`);
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

  return (
    <div className="space-y-4">
      <div className="mb-4 p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
        <p className="text-sm text-sky-300/90">
          Manage project library: regulatory, SMS, reference, and uploaded documents for the selected company
          {adminScopeCompanyId ? ' (all projects in this tenant shown below)' : ''}. Entity documents are managed on the main <strong>Library</strong> page.
        </p>
      </div>
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
            {(['regulatory', 'sms', 'reference', 'uploaded'] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => onSetLibrarySubTab(sub)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${librarySubTab === sub ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                {sub === 'regulatory' && <><FiFolder className="inline mr-1.5" />Regulatory</>}
                {sub === 'sms' && <><FiFileText className="inline mr-1.5" />SMS</>}
                {sub === 'reference' && <><FiCheckCircle className="inline mr-1.5" />Reference</>}
                {sub === 'uploaded' && <><FiUpload className="inline mr-1.5" />Uploaded</>}
              </button>
            ))}
          </div>
          <GlassCard className="mb-4">
            <h3 className="text-lg font-display font-bold mb-3">
              {librarySubTab === 'regulatory' && 'Import Regulatory'}
              {librarySubTab === 'sms' && 'Import SMS Data'}
              {librarySubTab === 'reference' && 'Import Reference (known good)'}
              {librarySubTab === 'uploaded' && 'Upload Documents'}
            </h3>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-sky/10 text-sky-lighter hover:bg-sky/20 cursor-pointer transition-colors">
              <FiUpload />
              Choose files
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
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
            const list = librarySubTab === 'regulatory' ? regulatoryFiles : librarySubTab === 'sms' ? smsDocuments : librarySubTab === 'reference' ? referenceDocuments : uploadedDocuments;
            return (
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-bold">
                    {librarySubTab === 'regulatory' && 'Regulatory'}
                    {librarySubTab === 'sms' && 'SMS Data'}
                    {librarySubTab === 'reference' && 'Reference'}
                    {librarySubTab === 'uploaded' && 'Uploaded'}
                    {' '}({list.length})
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
                  <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                    {list.map((doc: any) => (
                      <div key={doc._id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg group">
                        <div className="flex items-center gap-3 min-w-0">
                          <FiFile className="text-white/70 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{doc.name}</div>
                            <div className="text-xs text-white/60 flex items-center gap-2">
                              {doc.category && <Badge>{doc.category}</Badge>}
                              {formatFileSize(doc.size)}
                              {doc.extractedAt && new Date(doc.extractedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => handleLibraryDelete(doc._id)} className="p-1.5 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
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
