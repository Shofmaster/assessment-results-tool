import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiTrash2, FiShield, FiUsers, FiFile, FiChevronDown, FiChevronRight, FiDownload, FiHardDrive } from 'react-icons/fi';
import {
  useAllSharedAgentDocs,
  useAddSharedAgentDoc,
  useRemoveSharedAgentDoc,
  useAllUsers,
  useSetUserRole,
  useGenerateUploadUrl,
  useUserSettings,
} from '../hooks/useConvexData';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';

const AGENT_TYPES = [
  { id: 'faa-inspector', name: 'FAA Inspector', color: 'text-blue-400' },
  { id: 'shop-owner', name: 'Shop Owner', color: 'text-green-400' },
  { id: 'part145-operator', name: 'Part 145 Operator', color: 'text-cyan-400' },
  { id: 'part91-operator', name: 'Part 91 Operator', color: 'text-sky-400' },
  { id: 'part135-inspector', name: 'Part 135 Inspector', color: 'text-orange-400' },
  { id: 'isbao-auditor', name: 'IS-BAO Auditor', color: 'text-purple-400' },
  { id: 'easa-inspector', name: 'EASA Inspector', color: 'text-amber-400' },
  { id: 'as9100-auditor', name: 'AS9100 Auditor', color: 'text-red-400' },
  { id: 'sms-consultant', name: 'SMS Consultant', color: 'text-teal-400' },
  { id: 'safety-auditor', name: 'Safety Auditor', color: 'text-rose-400' },
] as const;

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

export default function AdminPanel() {
  const allDocs = useAllSharedAgentDocs() as any[] | undefined;
  const addDoc = useAddSharedAgentDoc();
  const removeDoc = useRemoveSharedAgentDoc();
  const allUsers = useAllUsers() as any[] | undefined;
  const setRole = useSetUserRole();
  const generateUploadUrl = useGenerateUploadUrl();
  const userSettings = useUserSettings() as any;
  const convex = useConvex();

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ agentId: string; current: number; total: number } | null>(null);
  const [tab, setTab] = useState<'kb' | 'users'>('kb');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [driveImporting, setDriveImporting] = useState<string | null>(null);

  const docsByAgent = (agentId: string) =>
    (allDocs || []).filter((d: any) => d.agentId === agentId);

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
          extractedText = await extractor.extractText(buffer, file.name, file.type);
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

  const handleDriveImport = async (agentId: string) => {
    if (!userSettings?.googleClientId || !userSettings?.googleApiKey) {
      alert('Configure Google Drive credentials in Settings first.');
      return;
    }
    setDriveImporting(agentId);
    try {
      const { GoogleDriveService } = await import('../services/googleDrive');
      const driveService = new GoogleDriveService({
        clientId: userSettings.googleClientId,
        apiKey: userSettings.googleApiKey,
      });
      await driveService.signIn();
      const files = await driveService.openPicker();
      if (files.length === 0) return;

      setUploadProgress({ agentId, current: 0, total: files.length });
      const { DocumentExtractor } = await import('../services/documentExtractor');
      const extractor = new DocumentExtractor();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ agentId, current: i + 1, total: files.length });

        const buffer = await driveService.downloadFile(file.id);
        let extractedText = '';
        try {
          extractedText = await extractor.extractText(buffer, file.name, file.mimeType);
        } catch {
          // store without text
        }

        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.mimeType || 'application/octet-stream' },
            body: new Blob([buffer]),
          });
          const { storageId: sid } = await result.json();
          storageId = sid;
        } catch {
          // optional
        }

        await addDoc({
          agentId,
          name: file.name,
          path: `google-drive://${file.id}`,
          source: 'google-drive',
          mimeType: file.mimeType || undefined,
          extractedText: extractedText || undefined,
          storageId,
        });
      }
    } catch (err: any) {
      console.error('Drive import failed:', err);
      alert(`Drive import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setDriveImporting(null);
      setUploadProgress(null);
    }
  };

  const handleDownloadDoc = async (doc: any) => {
    if (doc.storageId) {
      try {
        const url = await convex.query(api.fileActions.getFileUrl, { storageId: doc.storageId });
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
    (uploadProgress?.agentId === agentId) || driveImporting === agentId;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FiShield className="text-3xl text-sky-light" />
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Admin Panel</h1>
          <p className="text-white/50 text-sm">Manage shared knowledge bases and user roles</p>
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
          onClick={() => setTab('users')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'users' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiUsers className="inline mr-2" />
          Users
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
                  <p className="text-white/40 text-sm mt-1">You'll choose which agent to assign them to</p>
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
                <div key={agent.id} className="glass rounded-xl border border-white/10">
                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                    className="w-full flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <FiChevronDown className="text-white/40" /> : <FiChevronRight className="text-white/40" />}
                      <span className={`font-medium ${agent.color}`}>{agent.name}</span>
                      <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                        {docs.length} doc{docs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {docs.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportAgentKB(agent.id);
                        }}
                        className="text-white/30 hover:text-sky-lighter transition-colors"
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
                            agentUploading ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-sky/10 text-sky-lighter hover:bg-sky/20'
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

                        <button
                          onClick={() => handleDriveImport(agent.id)}
                          disabled={agentUploading}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            agentUploading ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <FiHardDrive />
                          {driveImporting === agent.id ? 'Importing...' : 'Import from Drive'}
                        </button>
                      </div>

                      {/* Document list */}
                      {docs.length === 0 ? (
                        <div className="text-center py-6 text-white/30">
                          <FiFile className="text-2xl mx-auto mb-2 opacity-50" />
                          <p className="text-sm italic">No shared documents for this agent yet.</p>
                          <p className="text-xs mt-1">Upload files, import from Google Drive, or drag and drop here.</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {docs.map((doc: any) => (
                            <div key={doc._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 group">
                              <div className="flex items-center gap-2 min-w-0">
                                <FiFile className="text-white/40 flex-shrink-0" />
                                <span className="text-sm text-white/80 truncate">{doc.name}</span>
                                <span className="text-xs text-white/30">
                                  {doc.extractedText ? `${Math.round(doc.extractedText.length / 1000)}k chars` : 'no text'}
                                </span>
                                {doc.source === 'google-drive' && (
                                  <span className="text-xs text-sky-light/40 bg-sky/5 px-1.5 py-0.5 rounded">Drive</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  onClick={() => handleDownloadDoc(doc)}
                                  className="text-white/40 hover:text-sky-lighter transition-colors p-1"
                                  title="Download document"
                                >
                                  <FiDownload className="w-3.5 h-3.5" />
                                </button>
                                {deleteConfirmId === doc._id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDeleteDoc(doc._id)}
                                      className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded hover:bg-red-500/30 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="text-xs text-white/40 px-1 hover:text-white transition-colors"
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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Picker Modal — for files dropped without an expanded agent */}
      {pendingFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPendingFiles(null)}>
          <div className="glass rounded-2xl border border-white/10 p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-display font-semibold text-white mb-2">Assign Files to Agent</h3>
            <p className="text-sm text-white/50 mb-4">
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
                  <span className="text-xs text-white/30">{docsByAgent(agent.id).length} docs</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingFiles(null)}
              className="mt-4 w-full text-center text-sm text-white/40 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* User Management */}
      {tab === 'users' && (
        <div className="glass rounded-xl border border-white/10">
          {!allUsers ? (
            <div className="p-8 text-center text-white/40">Loading users...</div>
          ) : allUsers.length === 0 ? (
            <div className="p-8 text-center text-white/40">No users found.</div>
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
                      <div className="text-xs text-white/40">{u.email}</div>
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
        </div>
      )}
    </div>
  );
}
