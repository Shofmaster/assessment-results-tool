import { useRef, useMemo } from 'react';
import { FiUpload, FiTrash2, FiFile } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useDocumentsByCompany,
  useAddDocument,
  useRemoveDocument,
  useDefaultClaudeModel,
  useGenerateUploadUrl,
  useIsAerogapEmployee,
  useUserSettings,
  useProjects,
} from '../hooks/useConvexData';
import { DocumentExtractor } from '../services/documentExtractor';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Badge } from './ui';

/** Library page shows only entity documents; other categories are managed in Admin. */
export default function LibraryManager() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();
  const defaultModel = useDefaultClaudeModel();
  const isStaff = useIsAerogapEmployee();
  const sidebarSettings = useUserSettings();
  const adminScopeCompanyId = sidebarSettings?.activeCompanyId as string | undefined;
  const projects = (useProjects() || []) as any[];

  const entityByCompany = useDocumentsByCompany(
    isStaff && adminScopeCompanyId ? adminScopeCompanyId : undefined,
    'entity',
  );
  const entityByProject = useDocuments(activeProjectId || undefined, 'entity');

  const entityDocuments = (
    isStaff && adminScopeCompanyId ? entityByCompany || [] : entityByProject || []
  ) as any[];

  const libraryTargetProjectId = useMemo(() => {
    if (!isStaff || !adminScopeCompanyId) return activeProjectId;
    const inCompany =
      activeProjectId &&
      projects.some(
        (p: any) =>
          String(p._id) === String(activeProjectId) &&
          String(p.companyId) === String(adminScopeCompanyId),
      );
    if (inCompany) return activeProjectId;
    const first = projects.find((p: any) => String(p.companyId) === String(adminScopeCompanyId));
    return first?._id ?? null;
  }, [isStaff, adminScopeCompanyId, activeProjectId, projects]);

  const uploadProjectId = libraryTargetProjectId;

  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();
  const generateUploadUrl = useGenerateUploadUrl();

  if (isStaff && !adminScopeCompanyId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a company</h2>
          <p className="text-white/70 mb-6">
            Choose a tenant in the sidebar company scope or from the Companies page to view entity documents for that workspace.
          </p>
          <Button size="lg" onClick={() => navigate('/companies')} className="mx-auto">
            Open Companies
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (!isStaff && !activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/70 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/logbook')}
            className="mx-auto"
          >
            Open Logbook
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (isStaff && adminScopeCompanyId && !uploadProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">No project in this company</h2>
          <p className="text-white/70 mb-6">Create a project in the sidebar for this tenant to upload entity documents.</p>
        </GlassCard>
      </div>
    );
  }

  const handleImportEntity = () => {
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/gif,image/webp';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const extractor = new DocumentExtractor();
      for (const file of files) {
        let extractedText = '';
        let extractionMeta: { backend: string; confidence?: number } | undefined;
        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const uploadResult = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          const uploadJson = await uploadResult.json();
          storageId = uploadJson.storageId;
        } catch {
          // Storage upload is best-effort; extraction still proceeds.
        }
        try {
          const buffer = await file.arrayBuffer();
          const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
          extractedText = extracted.text;
          extractionMeta = extracted.metadata;
        } catch (err: any) {
          toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
        }
        await addDocument({
          projectId: uploadProjectId as any,
          category: 'entity',
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
      if (files.length > 0) toast.success(`Added ${files.length} entity document${files.length !== 1 ? 's' : ''}`);
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

  const scopedCopy =
    isStaff && adminScopeCompanyId
      ? 'All entity documents across projects in the selected company. Imports go to the active sidebar project when it belongs to this company; otherwise the first project in the company.'
      : 'Organization manuals, procedures, and other entity documentation for this project. Other library categories are managed in Admin.';

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Entity Documents
        </h1>
        <p className="text-white/70 text-lg">{scopedCopy}</p>
      </div>

      <GlassCard className="mb-6">
        <h2 className="text-xl font-display font-bold mb-4">Import Entity Documents</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleImportEntity}
            icon={<FiUpload className="text-xl" />}
            className="w-full sm:w-auto"
            disabled={!uploadProjectId}
          >
            Import Files
          </Button>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold">Entity Documents ({entityDocuments.length})</h2>
        </div>

        {entityDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FiFile className="text-6xl text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No entity documents yet</p>
            <p className="text-white/70 text-sm mt-2">
              Click &quot;Import Files&quot; above to add manuals, procedures, or other organization documents.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            {entityDocuments.map((file: any) => (
              <div
                key={file._id}
                className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-sky to-sky-light">
                    <FiFile className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-sm text-white/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {file.category && <Badge>{file.category}</Badge>}
                      {file.projectName && (
                        <span className="text-white/50 text-xs">Project: {file.projectName}</span>
                      )}
                      <span>{formatFileSize(file.size)}</span>
                      <span>{new Date(file.extractedAt).toLocaleDateString()}</span>
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
    </div>
  );
}
