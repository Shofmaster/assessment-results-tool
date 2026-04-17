import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiTrash2, FiFile, FiChevronDown, FiChevronRight, FiDownload, FiFolder, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button, GlassCard } from './ui';
import {
  useSharedAgentDocsForCompany,
  useAddSharedAgentDoc,
  useRemoveSharedAgentDoc,
  useUpdateSharedAgentDocRegion,
  useGenerateUploadUrl,
  useDefaultClaudeModel,
} from '../hooks/useConvexData';
import { useConvex, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { AGENT_TYPES } from '../config/adminAgentTypes';
import { AUDITOR_DOCUMENT_REQUIREMENTS, DOC_TYPE_LABELS, type AuditorCoverageAgentId } from '../config/auditorDocumentRequirements';
import { REGIONS, getRegionColor } from '../config/regionConfig';
import { filterAdminKbReferenceUploadFiles, fileDisplayPathForUpload } from '../utils/fileUploadPaths';
import { getConvexErrorMessage } from '../utils/convexError';

function asConvexArray<T = any>(v: T[] | undefined | null | unknown): T[] {
  return Array.isArray(v) ? v : [];
}

function pickFolder(onPick: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.setAttribute('directory', '');
  input.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none';
  const teardown = () => { queueMicrotask(() => input.remove()); };
  input.addEventListener('change', () => { const list = input.files; teardown(); if (list?.length) onPick(Array.from(list)); });
  input.addEventListener('cancel', teardown);
  document.body.appendChild(input);
  input.click();
}

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

interface Props {
  adminScopeCompanyId: string | undefined;
  isStaff: boolean | null | undefined;
}

export default function AdminKbTab({ adminScopeCompanyId, isStaff }: Props) {
  const allDocs = useSharedAgentDocsForCompany(adminScopeCompanyId) as any[] | undefined;
  const addDoc = useAddSharedAgentDoc();
  const removeDoc = useRemoveSharedAgentDoc();
  const updateDocRegion = useUpdateSharedAgentDocRegion();
  const generateUploadUrl = useGenerateUploadUrl();
  const defaultModel = useDefaultClaudeModel();
  const convex = useConvex();
  const synthesizePatterns = useAction(api.auditIntelligenceActions.synthesizePatterns);

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ agentId: string; current: number; total: number } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [quickUploadAgentId, setQuickUploadAgentId] = useState<string>(AGENT_TYPES[0]?.id || '');
  const [uploadAsPlatformWide, setUploadAsPlatformWide] = useState(false);
  const [memoryGenStatus, setMemoryGenStatus] = useState<{ loading: boolean; message: string | null; error: string | null }>({ loading: false, message: null, error: null });

  const canDeleteSharedDoc = (doc: any) => Boolean(doc?.companyId) || Boolean(isStaff);
  const docsByAgent = (agentId: string) => asConvexArray(allDocs).filter((d: any) => d.agentId === agentId);
  const isUploading = (agentId: string) => uploadProgress?.agentId === agentId;
  const getAgentDocRequirements = (agentId: string) => AUDITOR_DOCUMENT_REQUIREMENTS[agentId as AuditorCoverageAgentId];

  const handleGenerateMemory = async () => {
    setMemoryGenStatus({ loading: true, message: null, error: null });
    try {
      const result = await synthesizePatterns({}) as { success: boolean; issueCount: number; message: string };
      if (result.success) {
        toast.success(`Memory generated from ${result.issueCount} findings`);
        setMemoryGenStatus({ loading: false, message: result.message, error: null });
      } else {
        setMemoryGenStatus({ loading: false, message: null, error: result.message });
      }
    } catch (err: any) {
      const msg = err?.message || 'Generation failed';
      toast.error(msg);
      setMemoryGenStatus({ loading: false, message: null, error: msg });
    }
  };

  const handleFileUpload = async (agentId: string, files: File[]) => {
    if (files.length === 0) return;
    const { accepted, skipped } = filterAdminKbReferenceUploadFiles(files);
    if (!accepted.length) { toast.error('No supported files (PDF, Word, TXT, CSV, XLSX).'); return; }
    if (skipped > 0) toast.message(`${skipped} file(s) skipped (unsupported type).`);
    setUploadProgress({ agentId, current: 0, total: accepted.length });
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();
    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        const displayPath = fileDisplayPathForUpload(file);
        setUploadProgress({ agentId, current: i + 1, total: accepted.length });
        let extractedText = '';
        try { const buffer = await file.arrayBuffer(); extractedText = await extractor.extractText(buffer, file.name, file.type, defaultModel); } catch { /* optional */ }
        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          const { storageId: sid } = await result.json();
          storageId = sid;
        } catch { /* optional */ }
        await addDoc({
          agentId,
          name: displayPath,
          path: displayPath,
          source: 'local',
          mimeType: file.type || undefined,
          extractedText: extractedText || undefined,
          storageId,
          ...(uploadAsPlatformWide ? {} : { companyId: adminScopeCompanyId as any }),
        });
      }
      toast.success(`Uploaded ${accepted.length} knowledge base document${accepted.length !== 1 ? 's' : ''}`);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDownloadDoc = async (doc: any) => {
    if (doc.storageId) {
      try {
        const url = await convex.query(api.fileActions.getSharedAgentDocumentFileUrl, { documentId: doc._id });
        if (url) { window.open(url, '_blank'); return; }
      } catch { /* fall through */ }
    }
    if (doc.extractedText) {
      const blob = new Blob([doc.extractedText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name.replace(/\.[^.]+$/, '') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportAgentKB = (agentId: string) => {
    const docs = docsByAgent(agentId);
    if (docs.length === 0) return;
    const agentName = AGENT_TYPES.find((a) => a.id === agentId)?.name || agentId;
    const exportData = {
      agent: agentName,
      agentId,
      exportedAt: new Date().toISOString(),
      documents: docs.map((d: any) => ({ name: d.name, source: d.source, mimeType: d.mimeType, extractedText: d.extractedText || '', addedAt: d.addedAt })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kb-${agentId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteDoc = async (docId: string) => {
    const doc = asConvexArray(allDocs).find((d: any) => d._id === docId);
    if (doc && !canDeleteSharedDoc(doc)) { toast.error('This is a platform-wide document and is read-only for your role.'); return; }
    try {
      await removeDoc({ documentId: docId as any });
      setDeleteConfirmId(null);
      toast.success('Knowledge base document removed');
    } catch (err: unknown) {
      setDeleteConfirmId(null);
      toast.error(getConvexErrorMessage(err) || 'Could not remove knowledge base document');
    }
  };

  const onGlobalDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const targetAgentId = expandedAgent || quickUploadAgentId;
      if (!targetAgentId) { toast.error('Select an upload target agent first.'); return; }
      handleFileUpload(targetAgentId, acceptedFiles);
    },
    [expandedAgent, quickUploadAgentId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ accept: ACCEPTED_FILE_TYPES, noClick: true, onDrop: onGlobalDrop });

  return (
    <div {...getRootProps()} className="relative">
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="absolute inset-0 z-20 bg-sky/10 border-2 border-dashed border-sky-light/50 rounded-xl flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <FiUpload className="text-4xl text-sky-light mx-auto mb-2" />
            <p className="text-sky-lighter font-medium">
              {expandedAgent ? `Drop files to add to ${AGENT_TYPES.find((a) => a.id === expandedAgent)?.name}` : 'Drop files to upload'}
            </p>
            {!expandedAgent && <p className="text-white/70 text-sm mt-1">You'll choose which agent to assign them to</p>}
          </div>
        </div>
      )}

      <GlassCard border rounded="xl" className="mb-3">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">Simplified Agent Upload</h3>
          <p className="text-xs text-white/70 mt-1">Pick one target agent, then upload or drag-and-drop files anywhere in this tab.</p>
        </div>
        <div className="p-4 flex flex-wrap items-center gap-3">
          <select
            value={quickUploadAgentId}
            onChange={(e) => setQuickUploadAgentId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[260px]"
          >
            {AGENT_TYPES.map((agent) => (
              <option key={agent.id} value={agent.id} className="bg-slate-900 text-white">{agent.name}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors bg-sky/10 text-sky-lighter hover:bg-sky/20">
            <FiUpload />
            Upload Files to Selected Agent
            <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.csv,.xlsx" className="hidden" disabled={!quickUploadAgentId}
              onChange={(e) => { if (e.target.files?.length && quickUploadAgentId) { handleFileUpload(quickUploadAgentId, Array.from(e.target.files)); e.target.value = ''; } }} />
          </label>
          <button
            type="button"
            disabled={!quickUploadAgentId}
            onClick={() => { if (quickUploadAgentId) pickFolder((files) => handleFileUpload(quickUploadAgentId, files)); }}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${!quickUploadAgentId ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 text-white/90 hover:bg-white/15 cursor-pointer'}`}
          >
            <FiFolder />
            Upload Folder
          </button>
        </div>
        <label className="mt-3 mx-4 mb-2 flex items-center gap-2 text-xs text-white/75 cursor-pointer select-none">
          <input type="checkbox" checked={uploadAsPlatformWide} onChange={(e) => setUploadAsPlatformWide(e.target.checked)} className="rounded border-white/20" />
          Upload as platform-wide (visible to all companies)
        </label>
        <p className="mx-4 mb-1 text-[11px] text-white/50 leading-relaxed">Platform-wide uploads require platform staff. Leave unchecked for tenant-only knowledge base documents.</p>
        <p className="mx-4 mb-3 text-[11px] text-white/45 leading-relaxed">Folder upload: Chromium or Firefox recommended; Safari folder selection is best-effort. Unsupported file types in a folder are skipped (PDF, Word, TXT, CSV, XLSX only).</p>
      </GlassCard>

      <div className="space-y-3">
        {AGENT_TYPES.map((agent) => {
          const docs = docsByAgent(agent.id);
          const isExpanded = expandedAgent === agent.id;
          const agentUploading = isUploading(agent.id);
          const requirements = getAgentDocRequirements(agent.id);
          return (
            <GlassCard key={agent.id} border rounded="xl">
              <button
                onClick={() => { const next = isExpanded ? null : agent.id; setExpandedAgent(next); if (next) setQuickUploadAgentId(next); }}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <FiChevronDown className="text-white/70" /> : <FiChevronRight className="text-white/70" />}
                  <span className={`font-medium ${agent.color}`}>{agent.name}</span>
                  <span className="text-xs text-white/70 bg-white/5 px-2 py-0.5 rounded-full">{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
                </div>
                {docs.length > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); handleExportAgentKB(agent.id); }} className="text-white/60 hover:text-sky-lighter transition-colors" title={`Export ${agent.name} KB`}>
                    <FiDownload />
                  </button>
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  {uploadProgress?.agentId === agent.id && (
                    <div className="mb-3 text-sm text-sky-lighter flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-sky-light/30 border-t-sky-light rounded-full" />
                      Uploading file {uploadProgress.current} of {uploadProgress.total}...
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${agentUploading ? 'bg-white/5 text-white/70 cursor-not-allowed' : 'bg-sky/10 text-sky-lighter hover:bg-sky/20'}`}>
                      <FiUpload />
                      Upload Files
                      <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.csv,.xlsx" className="hidden" disabled={agentUploading}
                        onChange={(e) => { if (e.target.files?.length) { handleFileUpload(agent.id, Array.from(e.target.files)); e.target.value = ''; } }} />
                    </label>
                    <button
                      type="button"
                      disabled={agentUploading}
                      onClick={() => { if (!agentUploading) pickFolder((files) => handleFileUpload(agent.id, files)); }}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${agentUploading ? 'bg-white/5 text-white/70 cursor-not-allowed' : 'bg-white/10 text-white/90 hover:bg-white/15 cursor-pointer'}`}
                    >
                      <FiFolder />
                      Upload Folder
                    </button>
                    {agent.id === 'audit-intelligence-analyst' && (
                      <button
                        onClick={handleGenerateMemory}
                        disabled={memoryGenStatus.loading}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${memoryGenStatus.loading ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-purple-500/15 text-purple-300 hover:bg-purple-500/25'}`}
                        title="Analyze all past audit findings and auto-generate this agent's memory document"
                      >
                        <FiRefreshCw className={memoryGenStatus.loading ? 'animate-spin' : ''} />
                        {memoryGenStatus.loading ? 'Generating…' : 'Generate from Past Findings'}
                      </button>
                    )}
                  </div>
                  {agent.id === 'audit-intelligence-analyst' && (memoryGenStatus.message || memoryGenStatus.error) && (
                    <div className={`mb-3 text-xs px-3 py-2 rounded-lg ${memoryGenStatus.error ? 'bg-red-500/10 text-red-300' : 'bg-purple-500/10 text-purple-300'}`}>
                      {memoryGenStatus.error || memoryGenStatus.message}
                    </div>
                  )}

                  {requirements && (
                    <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-xs font-medium text-white/90 mb-2">Applicable documents for this agent</p>
                      <p className="text-[11px] text-white/60 mb-1">Required</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {[...requirements.coreShared, ...requirements.requiredSpecific].map((docType) => (
                          <span key={`${agent.id}-req-${docType}`} className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                            {DOC_TYPE_LABELS[docType] || docType}
                          </span>
                        ))}
                      </div>
                      {requirements.optionalSupporting.length > 0 && (
                        <>
                          <p className="text-[11px] text-white/60 mb-1">Optional supporting</p>
                          <div className="flex flex-wrap gap-1">
                            {requirements.optionalSupporting.map((docType) => (
                              <span key={`${agent.id}-opt-${docType}`} className="px-2 py-0.5 rounded-full text-[11px] bg-sky-500/15 text-sky-200 border border-sky-400/20">
                                {DOC_TYPE_LABELS[docType] || docType}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {docs.length === 0 ? (
                    <div className="text-center py-6 text-white/60">
                      <FiFile className="text-2xl mx-auto mb-2 opacity-50" />
                      <p className="text-sm italic">No shared documents for this agent yet.</p>
                      <p className="text-xs mt-1">Upload files or drag and drop here.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {docs.map((doc: any) => (
                        <div key={doc._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 group">
                          <div className="flex items-center gap-2 min-w-0">
                            <FiFile className="text-white/70 flex-shrink-0" />
                            <span className="text-sm text-white/80 truncate">{doc.name}</span>
                            <span className="text-xs text-white/60">{doc.extractedText ? `${Math.round(doc.extractedText.length / 1000)}k chars` : 'no text'}</span>
                            <select
                              value={doc.region || 'all'}
                              onChange={async (e) => {
                                try { await updateDocRegion({ documentId: doc._id, region: e.target.value }); }
                                catch (err: unknown) { toast.error('Could not update region', { description: getConvexErrorMessage(err) }); }
                              }}
                              className={`text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors ${getRegionColor(doc.region)}`}
                              title="Geographic region"
                            >
                              {REGIONS.map(r => <option key={r.id} value={r.id}>{r.short}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => handleDownloadDoc(doc)} className="text-white/70 hover:text-sky-lighter transition-colors p-1" title="Download document">
                              <FiDownload className="w-3.5 h-3.5" />
                            </button>
                            {!canDeleteSharedDoc(doc) ? (
                              <span className="text-[11px] text-white/45 px-1">read-only</span>
                            ) : deleteConfirmId === doc._id ? (
                              <div className="flex items-center gap-1">
                                <Button onClick={() => handleDeleteDoc(doc._id)} variant="destructive" size="sm">Confirm</Button>
                                <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-white/70 px-1 hover:text-white transition-colors">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirmId(doc._id)} className="text-red-400/60 hover:text-red-400 transition-colors p-1" title="Remove document">
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
