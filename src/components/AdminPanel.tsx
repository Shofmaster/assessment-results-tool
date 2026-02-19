import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiTrash2, FiShield, FiUsers, FiFile, FiChevronDown, FiChevronRight, FiDownload, FiBookOpen, FiFolder, FiFileText, FiCheckCircle, FiBook } from 'react-icons/fi';
import { toast } from 'sonner';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Badge } from './ui';
import { useAppStore } from '../store/appStore';
import {
  useAllSharedAgentDocs,
  useAddSharedAgentDoc,
  useRemoveSharedAgentDoc,
  useAllSharedReferenceDocsAdmin,
  useAddSharedReferenceDoc,
  useRemoveSharedReferenceDoc,
  useAllUsers,
  useSetUserRole,
  useGenerateUploadUrl,
  useDefaultClaudeModel,
  useProjects,
  useDocuments,
  useAddDocument,
  useRemoveDocument,
  useClearDocuments,
  useSharedAgentDocsByAgents,
} from '../hooks/useConvexData';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { AUDIT_AGENTS } from '../services/auditAgents';
import { DocumentExtractor } from '../services/documentExtractor';

const AGENT_TYPES = [
  { id: 'faa-inspector', name: 'FAA Inspector', color: 'text-blue-400' },
  { id: 'shop-owner', name: 'Shop Owner', color: 'text-green-400' },
  { id: 'isbao-auditor', name: 'IS-BAO Auditor', color: 'text-purple-400' },
  { id: 'easa-inspector', name: 'EASA Inspector', color: 'text-amber-400' },
  { id: 'as9100-auditor', name: 'AS9100 Auditor', color: 'text-red-400' },
  { id: 'sms-consultant', name: 'SMS Consultant', color: 'text-teal-400' },
  { id: 'safety-auditor', name: 'Safety Auditor', color: 'text-orange-400' },
] as const;

const REFERENCE_DOC_TYPES = [
  { id: 'part-145-manual', name: 'Part 145 Repair Station Manual', color: 'text-blue-400' },
  { id: 'gmm', name: 'General Maintenance Manual (GMM)', color: 'text-green-400' },
  { id: 'part-135-manual', name: 'Part 135 Operations Manual', color: 'text-purple-400' },
  { id: 'ops-specs', name: 'Operations Specifications (Ops Specs)', color: 'text-amber-400' },
  { id: 'mel', name: 'Minimum Equipment List (MEL/MMEL)', color: 'text-red-400' },
  { id: 'training-program', name: 'Training Program Manual', color: 'text-teal-400' },
  { id: 'qcm', name: 'Quality Control Manual (QCM)', color: 'text-orange-400' },
  { id: 'sms-manual', name: 'SMS Manual', color: 'text-cyan-400' },
  { id: 'ipm', name: 'Inspection Procedures Manual (IPM)', color: 'text-pink-400' },
  { id: 'part-121-manual', name: 'Part 121 Operations Manual', color: 'text-indigo-400' },
  { id: 'part-91-manual', name: 'Part 91 Operations Manual', color: 'text-lime-400' },
  { id: 'hazmat-manual', name: 'Hazmat Training Manual', color: 'text-yellow-400' },
  { id: 'tool-calibration', name: 'Tool Calibration Manual', color: 'text-violet-400' },
  { id: 'isbao-standards', name: 'IS-BAO Standards', color: 'text-rose-400' },
  { id: 'other', name: 'Other Reference', color: 'text-white/70' },
] as const;

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

type LibrarySubTab = 'regulatory' | 'sms' | 'reference' | 'uploaded';

export default function AdminPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const allDocs = useAllSharedAgentDocs() as any[] | undefined;
  const addDoc = useAddSharedAgentDoc();
  const removeDoc = useRemoveSharedAgentDoc();
  const allRefDocs = useAllSharedReferenceDocsAdmin() as any[] | undefined;
  const addRefDoc = useAddSharedReferenceDoc();
  const removeRefDoc = useRemoveSharedReferenceDoc();
  const allUsers = useAllUsers() as any[] | undefined;
  const setRole = useSetUserRole();
  const generateUploadUrl = useGenerateUploadUrl();
  const convex = useConvex();
  const defaultModel = useDefaultClaudeModel();

  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const projects = (useProjects() || []) as any[];
  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const referenceDocuments = (useDocuments(activeProjectId || undefined, 'reference') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();
  const clearDocuments = useClearDocuments();
  const kbAgentIds = AUDIT_AGENTS.map((a) => a.id);
  const sharedKbDocs = (useSharedAgentDocsByAgents(kbAgentIds) || []) as any[];

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [expandedRefType, setExpandedRefType] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ agentId: string; current: number; total: number } | null>(null);
  const [refUploadProgress, setRefUploadProgress] = useState<{ typeId: string; current: number; total: number } | null>(null);
  const [tab, setTab] = useState<'kb' | 'refdocs' | 'users' | 'library'>('kb');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('regulatory');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);

  const docsByAgent = (agentId: string) =>
    (allDocs || []).filter((d: any) => d.agentId === agentId);

  const refDocsByType = (typeId: string) =>
    (allRefDocs || []).filter((d: any) => d.documentType === typeId);

  const handleRefFileUpload = async (typeId: string, files: File[]) => {
    if (files.length === 0) return;
    setRefUploadProgress({ typeId, current: 0, total: files.length });
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setRefUploadProgress({ typeId, current: i + 1, total: files.length });

        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type, defaultModel);
        } catch {
          // If extraction fails, store without text
        }

        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          const { storageId: sid } = await result.json();
          storageId = sid;
        } catch {
          // Storage upload optional
        }

        await addRefDoc({
          documentType: typeId,
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          extractedText: extractedText || undefined,
          storageId,
        });
      }
      toast.success(`Uploaded ${files.length} reference document${files.length !== 1 ? 's' : ''}`);
    } finally {
      setRefUploadProgress(null);
    }
  };

  const handleDeleteRefDoc = async (docId: string) => {
    await removeRefDoc({ documentId: docId as any });
    setDeleteConfirmId(null);
  };

  const handleDownloadRefDoc = async (doc: any) => {
    if (doc.storageId) {
      try {
        const url = await convex.query(api.fileActions.getSharedReferenceDocumentFileUrl, { documentId: doc._id });
        if (url) {
          window.open(url, '_blank');
          return;
        }
      } catch {
        // Fall through to text download
      }
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

  const isRefUploading = (typeId: string) =>
    (refUploadProgress?.typeId === typeId);

  const handleFileUpload = async (agentId: string, files: File[]) => {
    if (files.length === 0) return;
    setUploadProgress({ agentId, current: 0, total: files.length });
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ agentId, current: i + 1, total: files.length });

        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type, defaultModel);
        } catch {
          // If extraction fails, store without text
        }

        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          const { storageId: sid } = await result.json();
          storageId = sid;
        } catch {
          // Storage upload optional — text is the important part
        }

        await addDoc({
          agentId,
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          extractedText: extractedText || undefined,
          storageId,
        });
      }
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDownloadDoc = async (doc: any) => {
    if (doc.storageId) {
      try {
        const url = await convex.query(api.fileActions.getSharedAgentDocumentFileUrl, { documentId: doc._id });
        if (url) {
          window.open(url, '_blank');
          return;
        }
      } catch {
        // Fall through to text download
      }
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
      documents: docs.map((d: any) => ({
        name: d.name,
        source: d.source,
        mimeType: d.mimeType,
        extractedText: d.extractedText || '',
        addedAt: d.addedAt,
      })),
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
    await removeDoc({ documentId: docId as any });
    setDeleteConfirmId(null);
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleLibraryImport = async (category: LibrarySubTab, files: File[]) => {
    if (!activeProjectId || files.length === 0) return;
    const extractor = new DocumentExtractor();
    for (const file of files) {
      let extractedText = '';
      try {
        const buffer = await file.arrayBuffer();
        extractedText = await extractor.extractText(buffer, file.name, file.type, defaultModel);
      } catch (err: any) {
        toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
      }
      await addDocument({
        projectId: activeProjectId as any,
        category,
        name: file.name,
        path: file.name,
        source: 'local',
        mimeType: file.type || undefined,
        size: file.size,
        extractedText: extractedText || undefined,
        extractedAt: new Date().toISOString(),
      });
    }
    const label = category === 'regulatory' ? 'regulatory' : category === 'sms' ? 'SMS' : category === 'reference' ? 'reference' : 'uploaded';
    toast.success(`Added ${files.length} ${label} document${files.length !== 1 ? 's' : ''}`);
  };

  const handleLibraryDelete = (docId: string) => {
    if (confirm('Remove this document?')) removeDocument({ documentId: docId as any });
  };

  const handleAddKbDocAsProjectReference = async (kbDoc: { name: string; path?: string; extractedText?: string }) => {
    if (!activeProjectId) return;
    await addDocument({
      projectId: activeProjectId as any,
      category: 'reference',
      name: kbDoc.name,
      path: kbDoc.path || kbDoc.name,
      source: 'knowledge-base',
      extractedText: kbDoc.extractedText ?? '',
      extractedAt: new Date().toISOString(),
    });
    toast.success('Added as project reference');
  };

  // Global drop zone — auto-assigns to expanded agent, or shows picker
  const onGlobalDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      if (expandedAgent) {
        handleFileUpload(expandedAgent, acceptedFiles);
      } else {
        setPendingFiles(acceptedFiles);
      }
    },
    [expandedAgent]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_FILE_TYPES,
    noClick: true,
    onDrop: onGlobalDrop,
  });

  const isUploading = (agentId: string) =>
    (uploadProgress?.agentId === agentId);

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FiShield className="text-3xl text-sky-light" />
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Admin Panel</h1>
          <p className="text-white/70 text-sm">Manage shared knowledge bases and user roles</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <button
          onClick={() => setTab('kb')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'kb' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiFile className="inline mr-2" />
          Knowledge Bases
        </button>
        <button
          onClick={() => setTab('refdocs')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'refdocs' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiBookOpen className="inline mr-2" />
          Reference Documents
        </button>
        <button
          onClick={() => setTab('users')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'users' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiUsers className="inline mr-2" />
          Users
        </button>
        <button
          onClick={() => setTab('library')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'library' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiFolder className="inline mr-2" />
          Library
        </button>
      </div>

      {/* Knowledge Base Management */}
      {tab === 'kb' && (
        <div {...getRootProps()} className="relative">
          <input {...getInputProps()} />

          {/* Drag overlay */}
          {isDragActive && (
            <div className="absolute inset-0 z-20 bg-sky/10 border-2 border-dashed border-sky-light/50 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <FiUpload className="text-4xl text-sky-light mx-auto mb-2" />
                <p className="text-sky-lighter font-medium">
                  {expandedAgent
                    ? `Drop files to add to ${AGENT_TYPES.find((a) => a.id === expandedAgent)?.name}`
                    : 'Drop files to upload'}
                </p>
                {!expandedAgent && (
                  <p className="text-white/70 text-sm mt-1">You'll choose which agent to assign them to</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {AGENT_TYPES.map((agent) => {
              const docs = docsByAgent(agent.id);
              const isExpanded = expandedAgent === agent.id;
              const agentUploading = isUploading(agent.id);

              return (
                <GlassCard key={agent.id} border rounded="xl">
                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                    className="w-full flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <FiChevronDown className="text-white/70" /> : <FiChevronRight className="text-white/70" />}
                      <span className={`font-medium ${agent.color}`}>{agent.name}</span>
                      <span className="text-xs text-white/70 bg-white/5 px-2 py-0.5 rounded-full">
                        {docs.length} doc{docs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {docs.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportAgentKB(agent.id);
                        }}
                        className="text-white/60 hover:text-sky-lighter transition-colors"
                        title={`Export ${agent.name} KB`}
                      >
                        <FiDownload />
                      </button>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                      {/* Upload progress */}
                      {uploadProgress?.agentId === agent.id && (
                        <div className="mb-3 text-sm text-sky-lighter flex items-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-sky-light/30 border-t-sky-light rounded-full" />
                          Uploading file {uploadProgress.current} of {uploadProgress.total}...
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        <label
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                            agentUploading ? 'bg-white/5 text-white/70 cursor-not-allowed' : 'bg-sky/10 text-sky-lighter hover:bg-sky/20'
                          }`}
                        >
                          <FiUpload />
                          Upload Files
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.docx,.doc,.txt,.csv,.xlsx"
                            className="hidden"
                            disabled={agentUploading}
                            onChange={(e) => {
                              if (e.target.files?.length) {
                                handleFileUpload(agent.id, Array.from(e.target.files));
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {/* Document list */}
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
                                <span className="text-xs text-white/60">
                                  {doc.extractedText ? `${Math.round(doc.extractedText.length / 1000)}k chars` : 'no text'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  onClick={() => handleDownloadDoc(doc)}
                                  className="text-white/70 hover:text-sky-lighter transition-colors p-1"
                                  title="Download document"
                                >
                                  <FiDownload className="w-3.5 h-3.5" />
                                </button>
                                {deleteConfirmId === doc._id ? (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      onClick={() => handleDeleteDoc(doc._id)}
                                      variant="destructive"
                                      size="sm"
                                    >
                                      Confirm
                                    </Button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="text-xs text-white/70 px-1 hover:text-white transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmId(doc._id)}
                                    className="text-red-400/60 hover:text-red-400 transition-colors p-1"
                                    title="Remove document"
                                  >
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
      )}

      {/* Agent Picker Modal — for files dropped without an expanded agent */}
      {pendingFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPendingFiles(null)}>
          <GlassCard border rounded="2xl" padding="md" className="max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-display font-semibold text-white mb-2">Assign Files to Agent</h3>
            <p className="text-sm text-white/70 mb-4">
              {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} selected. Choose which agent's knowledge base to add them to.
            </p>
            <div className="space-y-2">
              {AGENT_TYPES.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    const files = pendingFiles;
                    setPendingFiles(null);
                    handleFileUpload(agent.id, files);
                    setExpandedAgent(agent.id);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between"
                >
                  <span className={`font-medium ${agent.color}`}>{agent.name}</span>
                  <span className="text-xs text-white/60">{docsByAgent(agent.id).length} docs</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingFiles(null)}
              className="mt-4 w-full text-center text-sm text-white/70 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </GlassCard>
        </div>
      )}

      {/* Reference Documents Management */}
      {tab === 'refdocs' && (
        <div>
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p className="text-sm text-amber-300/90">
              Upload reference documents here to make them available in <strong>Paperwork Review</strong> across all projects.
              These serve as "known-good" standards for comparing against submitted paperwork.
            </p>
          </div>
          <div className="space-y-3">
            {REFERENCE_DOC_TYPES.map((docType) => {
              const docs = refDocsByType(docType.id);
              const isExpanded = expandedRefType === docType.id;
              const typeUploading = isRefUploading(docType.id);

              return (
                <GlassCard key={docType.id} border rounded="xl">
                  <button
                    onClick={() => setExpandedRefType(isExpanded ? null : docType.id)}
                    className="w-full flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <FiChevronDown className="text-white/70" /> : <FiChevronRight className="text-white/70" />}
                      <span className={`font-medium ${docType.color}`}>{docType.name}</span>
                      <span className="text-xs text-white/70 bg-white/5 px-2 py-0.5 rounded-full">
                        {docs.length} doc{docs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                      {refUploadProgress?.typeId === docType.id && (
                        <div className="mb-3 text-sm text-sky-lighter flex items-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-sky-light/30 border-t-sky-light rounded-full" />
                          Uploading file {refUploadProgress.current} of {refUploadProgress.total}...
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mb-3">
                        <label
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                            typeUploading ? 'bg-white/5 text-white/70 cursor-not-allowed' : 'bg-sky/10 text-sky-lighter hover:bg-sky/20'
                          }`}
                        >
                          <FiUpload />
                          Upload Files
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.docx,.doc,.txt,.csv,.xlsx"
                            className="hidden"
                            disabled={typeUploading}
                            onChange={(e) => {
                              if (e.target.files?.length) {
                                handleRefFileUpload(docType.id, Array.from(e.target.files));
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {docs.length === 0 ? (
                        <div className="text-center py-6 text-white/60">
                          <FiBookOpen className="text-2xl mx-auto mb-2 opacity-50" />
                          <p className="text-sm italic">No reference documents for this type yet.</p>
                          <p className="text-xs mt-1">Upload files or drag and drop here.</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {docs.map((doc: any) => (
                            <div key={doc._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 group">
                              <div className="flex items-center gap-2 min-w-0">
                                <FiFile className="text-white/70 flex-shrink-0" />
                                <span className="text-sm text-white/80 truncate">{doc.name}</span>
                                <span className="text-xs text-white/60">
                                  {doc.extractedText ? `${Math.round(doc.extractedText.length / 1000)}k chars` : 'no text'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  onClick={() => handleDownloadRefDoc(doc)}
                                  className="text-white/70 hover:text-sky-lighter transition-colors p-1"
                                  title="Download document"
                                >
                                  <FiDownload className="w-3.5 h-3.5" />
                                </button>
                                {deleteConfirmId === doc._id ? (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      onClick={() => handleDeleteRefDoc(doc._id)}
                                      variant="destructive"
                                      size="sm"
                                    >
                                      Confirm
                                    </Button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="text-xs text-white/70 px-1 hover:text-white transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmId(doc._id)}
                                    className="text-red-400/60 hover:text-red-400 transition-colors p-1"
                                    title="Remove document"
                                  >
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
      )}

      {/* User Management */}
      {tab === 'users' && (
        <GlassCard border rounded="xl">
          {!allUsers ? (
            <div className="p-8 text-center text-white/70">Loading users...</div>
          ) : allUsers.length === 0 ? (
            <div className="p-8 text-center text-white/70">No users found.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {allUsers.map((u: any) => (
                <div key={u._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    {u.picture ? (
                      <img src={u.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium">
                        {(u.name || u.email)[0]}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">{u.name || u.email}</div>
                      <div className="text-xs text-white/70">{u.email}</div>
                    </div>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => setRole({ targetUserId: u._id, role: e.target.value })}
                    className="w-full sm:w-auto bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-light/50"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Project Library (regulatory, sms, reference, uploaded) — admin only */}
      {tab === 'library' && (
        <div className="space-y-4">
          <div className="mb-4 p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
            <p className="text-sm text-sky-300/90">
              Manage project library: regulatory, SMS, reference, and uploaded documents. Entity documents are managed on the main <strong>Library</strong> page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-white/70 text-sm">Project:</span>
            <select
              value={activeProjectId ?? ''}
              onChange={(e) => setActiveProjectId(e.target.value || null)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-light/50"
            >
              <option value="">Select project</option>
              {projects.map((p: any) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>
          {activeProjectId && (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {(['regulatory', 'sms', 'reference', 'uploaded'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setLibrarySubTab(sub)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      librarySubTab === sub ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
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
              {librarySubTab === 'reference' && sharedKbDocs.length > 0 && (
                <GlassCard className="mb-4">
                  <h3 className="text-lg font-display font-bold mb-2 flex items-center gap-2">
                    <FiBook className="text-amber-400" />
                    Add from Knowledge Base
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {sharedKbDocs.slice(0, 10).map((doc: any) => (
                      <div key={doc._id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                        <span className="text-sm truncate flex-1">{doc.name}</span>
                        <Button variant="warning" size="sm" onClick={() => handleAddKbDocAsProjectReference(doc)}>
                          Add as reference
                        </Button>
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
                          onClick={() => { if (confirm('Clear all uploaded documents?')) clearDocuments({ projectId: activeProjectId as any, category: 'uploaded' }); }}
                          className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10 rounded-lg"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    {list.length === 0 ? (
                      <p className="text-white/60 text-sm py-6">No documents in this category.</p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
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
                            <button
                              onClick={() => handleLibraryDelete(doc._id)}
                              className="p-1.5 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
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
      )}
    </div>
  );
}
