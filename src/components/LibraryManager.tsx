import { useRef } from 'react';
import { FiUpload, FiTrash2, FiFile } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useAddDocument,
  useRemoveDocument,
  useDefaultClaudeModel,
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

  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];

  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();

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

  const handleImportEntity = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/gif,image/webp';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
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

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Entity Documents
        </h1>
        <p className="text-white/60 text-lg">
          Organization manuals, procedures, and other entity documentation for this project. Other library categories are managed in Admin.
        </p>
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
