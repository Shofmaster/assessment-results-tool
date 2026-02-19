import { useState, useRef } from 'react';
import { FiUpload, FiTrash2, FiFile, FiFolder, FiFileText, FiCheckCircle, FiBook } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useAddDocument,
  useRemoveDocument,
  useClearDocuments,
  useSharedAgentDocsByAgents,
} from '../hooks/useConvexData';
import { AUDIT_AGENTS } from '../services/auditAgents';
import { DocumentExtractor } from '../services/documentExtractor';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Select, Badge } from './ui';

type TabType = 'regulatory' | 'entity' | 'sms' | 'reference' | 'uploaded';

export default function LibraryManager() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const [activeTab, setActiveTab] = useState<TabType>('regulatory');
  const [selectedCategory, setSelectedCategory] = useState('CFRs');

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();

  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const referenceDocuments = (useDocuments(activeProjectId || undefined, 'reference') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];

  const kbAgentIds = AUDIT_AGENTS.map((a) => a.id);
  const sharedKbDocs = (useSharedAgentDocsByAgents(kbAgentIds) || []) as any[];

  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();
  const clearDocuments = useClearDocuments();

  const regulatoryCategories = [
    'CFRs',
    'IS-BAO Standards',
    'EASA Regulations',
    'Advisory Circulars',
    'Other Standards',
  ];

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/projects')}
            className="mx-auto"
          >
            Go to Projects
          </Button>
        </GlassCard>
      </div>
    );
  }

  const handleImportRegulatory = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const extractor = new DocumentExtractor();
      for (const file of files) {
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type);
        } catch (err: any) {
          toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
        }
        await addDocument({
          projectId: activeProjectId as any,
          category: 'regulatory',
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          extractedText: extractedText || undefined,
          extractedAt: new Date().toISOString(),
        });
      }
      if (files.length > 0) toast.success(`Added ${files.length} regulatory document${files.length !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  const handleImportEntity = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const extractor = new DocumentExtractor();
      for (const file of files) {
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type);
        } catch (err: any) {
          toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
        }
        await addDocument({
          projectId: activeProjectId as any,
          category: 'entity',
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          extractedText: extractedText || undefined,
          extractedAt: new Date().toISOString(),
        });
      }
      if (files.length > 0) toast.success(`Added ${files.length} entity document${files.length !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  const handleImportSms = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const extractor = new DocumentExtractor();
      for (const file of files) {
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type);
        } catch (err: any) {
          toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
        }
        await addDocument({
          projectId: activeProjectId as any,
          category: 'sms',
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          extractedText: extractedText || undefined,
          extractedAt: new Date().toISOString(),
        });
      }
      if (files.length > 0) toast.success(`Added ${files.length} SMS data document${files.length !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  const handleImportReference = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const extractor = new DocumentExtractor();
      for (const file of files) {
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type);
        } catch (err: any) {
          toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
        }
        await addDocument({
          projectId: activeProjectId as any,
          category: 'reference',
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          extractedText: extractedText || undefined,
          extractedAt: new Date().toISOString(),
        });
      }
      if (files.length > 0) toast.success(`Added ${files.length} reference document${files.length !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  const handleAddKbDocAsReference = async (kbDoc: { _id: string; agentId: string; name: string; path: string; extractedText?: string }) => {
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
  };

  const handleImportUploaded = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const extractor = new DocumentExtractor();
      for (const file of files) {
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type);
        } catch (err: any) {
          toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
        }
        await addDocument({
          projectId: activeProjectId as any,
          category: 'uploaded',
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          extractedText: extractedText || undefined,
          extractedAt: new Date().toISOString(),
        });
      }
      if (files.length > 0) toast.success(`Added ${files.length} uploaded document${files.length !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  const handleDelete = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      removeDocument({ documentId: fileId as any });
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const displayFiles = (
    activeTab === 'regulatory'
      ? regulatoryFiles
      : activeTab === 'entity'
        ? entityDocuments
        : activeTab === 'sms'
          ? smsDocuments
          : activeTab === 'reference'
            ? referenceDocuments
            : []
  ) as any[];

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Document Library
        </h1>
        <p className="text-white/60 text-lg">
          Organize regulatory standards, reference (known-good) manuals, and entity documentation
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
        <button
          onClick={() => setActiveTab('regulatory')}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'regulatory'
              ? 'bg-gradient-to-r from-sky to-sky-light shadow-lg shadow-sky/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiFolder className="inline mr-2" />
          Regulatory Standards
        </button>
        <button
          onClick={() => setActiveTab('entity')}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'entity'
              ? 'bg-gradient-to-r from-sky to-sky-light shadow-lg shadow-sky/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiFile className="inline mr-2" />
          Entity Documents
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'sms'
              ? 'bg-gradient-to-r from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiFileText className="inline mr-2" />
          SMS Data
          {smsDocuments.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {smsDocuments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('reference')}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'reference'
              ? 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiCheckCircle className="inline mr-2" />
          Reference (known good)
          {referenceDocuments.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {referenceDocuments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('uploaded')}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'uploaded'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiUpload className="inline mr-2" />
          Uploaded Documents
          {uploadedDocuments.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {uploadedDocuments.length}
            </span>
          )}
        </button>
      </div>

      <GlassCard className="mb-6">
        <h2 className="text-xl font-display font-bold mb-4">
          {activeTab === 'regulatory'
            ? 'Import Regulatory Files'
            : activeTab === 'entity'
              ? 'Import Entity Documents'
              : activeTab === 'sms'
                ? 'Import SMS Data Documents'
                : activeTab === 'reference'
                  ? 'Import Reference (known good) Documents'
                  : 'Upload Documents'}
        </h2>

        {activeTab === 'regulatory' && (
          <div className="mb-4">
            <Select
              label="Select Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="md:w-64"
            >
              {regulatoryCategories.map((cat) => (
                <option key={cat} value={cat} className="bg-navy-800">
                  {cat}
                </option>
              ))}
            </Select>
          </div>
        )}

        {(activeTab === 'regulatory' || activeTab === 'entity' || activeTab === 'sms' || activeTab === 'reference') && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button
              variant={activeTab === 'reference' ? 'warning' : activeTab === 'sms' ? 'success' : 'primary'}
              size="lg"
              onClick={
                activeTab === 'regulatory'
                  ? handleImportRegulatory
                  : activeTab === 'entity'
                    ? handleImportEntity
                    : activeTab === 'sms'
                      ? handleImportSms
                      : handleImportReference
              }
              icon={<FiUpload className="text-xl" />}
              className="w-full sm:w-auto"
            >
              Import Files
            </Button>
          </div>
        )}

        {activeTab === 'uploaded' && (
          <Button
            variant="success"
            size="lg"
            onClick={handleImportUploaded}
            icon={<FiUpload className="text-xl" />}
            className="w-full sm:w-auto"
          >
            Upload Files
          </Button>
        )}
      </GlassCard>

      {activeTab === 'reference' && sharedKbDocs.length > 0 && (
        <GlassCard className="mb-6">
          <h2 className="text-xl font-display font-bold mb-2 flex items-center gap-2">
            <FiBook className="text-amber-400" />
            Add from Knowledge Base
          </h2>
          <p className="text-white/60 text-sm mb-4">
            Add agent knowledge base documents as project reference documents for paperwork review and comparison.
          </p>
          <div className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin pr-2">
            {sharedKbDocs.map((doc: any) => (
              <div
                key={doc._id}
                className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <FiBook className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{doc.name}</div>
                    <div className="text-xs text-white/70">
                      Agent: {AUDIT_AGENTS.find((a) => a.id === doc.agentId)?.name ?? doc.agentId}
                      {((doc as any).extractedTextLength ?? (doc as any).extractedText?.length ?? 0) > 0 && (
                        <span className="ml-2">· {((doc as any).extractedTextLength ?? (doc as any).extractedText?.length ?? 0).toLocaleString()} chars</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => handleAddKbDocAsReference(doc)}
                  className="flex-shrink-0"
                >
                  Add as reference
                </Button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

        {(activeTab === 'regulatory' || activeTab === 'entity' || activeTab === 'sms' || activeTab === 'reference') && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">
              {activeTab === 'regulatory'
                ? 'Regulatory Files'
                : activeTab === 'entity'
                  ? 'Entity Documents'
                  : activeTab === 'sms'
                    ? 'SMS Data Documents'
                    : 'Reference (known good) Documents'}{' '}
              ({displayFiles.length})
            </h2>
          </div>

          {displayFiles.length === 0 ? (
            <div className="text-center py-12">
              {activeTab === 'reference' ? (
                <FiCheckCircle className="text-6xl text-white/20 mx-auto mb-4" />
              ) : activeTab === 'sms' ? (
                <FiFileText className="text-6xl text-white/20 mx-auto mb-4" />
              ) : (
                <FiFolder className="text-6xl text-white/20 mx-auto mb-4" />
              )}
              <p className="text-white/60">
                {activeTab === 'reference'
                  ? 'No reference documents yet'
                  : activeTab === 'sms'
                    ? 'No SMS data documents yet'
                    : 'No files imported yet'}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {activeTab === 'reference'
                  ? 'Add repair station manuals, training manuals, or other known-good documents to compare against during paperwork review'
                  : activeTab === 'sms'
                    ? 'Add SMS manuals, hazard reports, safety data, or other SMS-related documents. All simulation participants can use this pool.'
                    : 'Click "Import Files" above to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {displayFiles.map((file: any) => (
                <div
                  key={file._id}
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        activeTab === 'reference'
                          ? 'bg-gradient-to-br from-amber-500 to-amber-600'
                          : activeTab === 'sms'
                            ? 'bg-gradient-to-br from-teal-500 to-teal-600'
                            : 'bg-gradient-to-br from-sky to-sky-light'
                      }`}
                    >
                      {activeTab === 'reference' ? (
                        <FiCheckCircle className="text-white" />
                      ) : activeTab === 'sms' ? (
                        <FiFileText className="text-white" />
                      ) : (
                        <FiFile className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{file.name}</div>
                      <div className="text-sm text-white/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {file.category && (
                          <Badge>{file.category}</Badge>
                        )}
                        <span>{formatFileSize(file.size)}</span>
                        <span>
                          {new Date(file.extractedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(file._id)}
                    className="p-2 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <FiTrash2 className="text-xl" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {activeTab === 'uploaded' && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">
              Uploaded Documents ({uploadedDocuments.length})
            </h2>
            {uploadedDocuments.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all uploaded documents?')) {
                    clearDocuments({ projectId: activeProjectId as any, category: 'uploaded' });
                  }
                }}
                className="px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {uploadedDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FiFileText className="text-6xl text-white/20 mx-auto mb-4" />
              <p className="text-white/60">No documents uploaded yet</p>
              <p className="text-white/70 text-sm mt-2">
                Upload files to extract their text content for analysis
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {uploadedDocuments.map((doc: any) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                      <FiFileText className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {doc.name}
                      </div>
                      <div className="text-sm text-white/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {doc.mimeType && (
                          <Badge>{doc.mimeType.split('/').pop()}</Badge>
                        )}
                        <span>{((doc as any).extractedTextLength ?? (doc as any).extractedText?.length ?? 0).toLocaleString()} chars extracted</span>
                        <span>
                          {new Date(doc.extractedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc._id)}
                    className="p-2 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <FiTrash2 className="text-xl" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
