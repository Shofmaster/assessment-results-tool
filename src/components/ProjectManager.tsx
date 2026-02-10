import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { GoogleDriveService } from '../services/googleDrive';
import { FiPlus, FiTrash2, FiEdit2, FiCheck, FiX, FiFileText, FiFolder, FiUploadCloud, FiDownloadCloud, FiClock, FiRefreshCw } from 'react-icons/fi';
import type { Project } from '../types/project';

export default function ProjectManager() {
  const projects = useAppStore((state) => state.projects);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const createProject = useAppStore((state) => state.createProject);
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const importProject = useAppStore((state) => state.importProject);
  const updateProjectDriveInfo = useAppStore((state) => state.updateProjectDriveInfo);
  const googleClientId = useAppStore((state) => state.googleClientId);
  const googleApiKey = useAppStore((state) => state.googleApiKey);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showDriveImport, setShowDriveImport] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; modifiedTime: string }>>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);

  const hasDriveConfig = !!(googleClientId && googleApiKey);

  const getDriveService = () => {
    if (!hasDriveConfig) return null;
    return new GoogleDriveService({ clientId: googleClientId, apiKey: googleApiKey });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const project = createProject(newName.trim(), newDescription.trim() || undefined);
    setNewName('');
    setNewDescription('');
    setShowCreate(false);
    setActiveProjectId(project.id);
    setCurrentView('dashboard');
  };

  const handleStartEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description || '');
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateProject(editingId, { name: editName.trim(), description: editDescription.trim() || undefined });
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    deleteProject(id);
    setDeleteConfirmId(null);
  };

  const handleSelectProject = (id: string) => {
    setActiveProjectId(id);
    setCurrentView('dashboard');
  };

  const handleExportProject = (project: Project) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.aqp.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.aqp.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Project;
        const imported: Project = {
          ...data,
          id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assessments: data.assessments || [],
          regulatoryFiles: data.regulatoryFiles || [],
          entityDocuments: data.entityDocuments || [],
          uploadedDocuments: data.uploadedDocuments || [],
          analyses: data.analyses || [],
        };
        importProject(imported);
        setCurrentView('dashboard');
      } catch {
        alert('Failed to import project. Please check the file format.');
      }
    };
    input.click();
  };

  // Google Drive sync: save project to Drive
  const handleSyncToDrive = async (project: Project) => {
    const service = getDriveService();
    if (!service) return;

    setSyncingId(project.id);
    try {
      const driveFileId = await service.saveProjectFile(project);
      const now = new Date().toISOString();
      updateProjectDriveInfo(project.id, driveFileId, now);
      alert(`Project "${project.name}" saved to Google Drive.`);
    } catch (error: any) {
      alert(`Failed to sync to Drive: ${error.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  // Google Drive import: list and load projects from Drive
  const handleShowDriveImport = async () => {
    const service = getDriveService();
    if (!service) return;

    setShowDriveImport(true);
    setLoadingDriveFiles(true);
    try {
      const files = await service.listProjectFiles();
      setDriveFiles(files);
    } catch (error: any) {
      alert(`Failed to list Drive projects: ${error.message}`);
      setShowDriveImport(false);
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  const handleImportFromDrive = async (fileId: string, _fileName: string) => {
    const service = getDriveService();
    if (!service) return;

    setLoadingDriveFiles(true);
    try {
      const project = await service.loadProjectFile(fileId);
      // Check if a project with this driveFileId already exists
      const existing = projects.find(p => p.driveFileId === fileId);
      if (existing) {
        alert(`Project "${existing.name}" is already linked to this Drive file. Delete the local copy first to re-import.`);
        return;
      }
      const imported: Project = {
        ...project,
        id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        driveFileId: fileId,
        lastSyncedAt: new Date().toISOString(),
      };
      importProject(imported);
      setShowDriveImport(false);
      setCurrentView('dashboard');
    } catch (error: any) {
      alert(`Failed to import project from Drive: ${error.message}`);
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            Projects
          </h1>
          <p className="text-white/60 text-lg">
            Organize your assessments, documents, and analyses into projects
          </p>
        </div>
        <div className="flex gap-3">
          {hasDriveConfig && (
            <button
              onClick={handleShowDriveImport}
              className="flex items-center gap-2 px-4 py-2 glass glass-hover rounded-xl transition-all"
            >
              <FiDownloadCloud />
              <span>From Drive</span>
            </button>
          )}
          <button
            onClick={handleImportProject}
            className="flex items-center gap-2 px-4 py-2 glass glass-hover rounded-xl transition-all"
          >
            <FiDownloadCloud />
            <span>Import File</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all"
          >
            <FiPlus />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Drive Import Modal */}
      {showDriveImport && (
        <div className="glass rounded-2xl p-6 mb-6 border border-green-500/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FiDownloadCloud className="text-green-400" />
              Import from Google Drive
            </h3>
            <button
              onClick={() => setShowDriveImport(false)}
              className="p-1 text-white/40 hover:text-white/60"
            >
              <FiX />
            </button>
          </div>
          {loadingDriveFiles ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="ml-3 text-white/60">Loading projects from Drive...</span>
            </div>
          ) : driveFiles.length === 0 ? (
            <p className="text-white/50 text-center py-6">No project files found in Google Drive.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {driveFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  <div>
                    <div className="font-medium">{file.name.replace('.aqp.json', '')}</div>
                    <div className="text-xs text-white/40">
                      Modified {new Date(file.modifiedTime).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleImportFromDrive(file.id, file.name)}
                    className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg text-sm hover:bg-green-500/30 transition-colors"
                  >
                    Import
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Project Form */}
      {showCreate && (
        <div className="glass rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Create New Project</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-1">Project Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Q4 2025 Audit — Acme Aviation"
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-sky-light/50 transition-colors"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1">Description (optional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of the project scope"
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-sky-light/50 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-6 py-2 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Project
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); setNewDescription(''); }}
                className="px-6 py-2 glass glass-hover rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Grid */}
      {projects.length === 0 && !showCreate ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">No Projects Yet</h2>
          <p className="text-white/60 mb-6">
            Create your first project to start organizing assessments and documents
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-8 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isEditing = editingId === project.id;
            const isDeleting = deleteConfirmId === project.id;
            const isSyncing = syncingId === project.id;

            return (
              <div
                key={project.id}
                className={`glass rounded-2xl p-6 transition-all duration-300 hover:transform hover:scale-[1.02] cursor-pointer ${
                  isActive ? 'ring-2 ring-sky-light/50 shadow-lg shadow-sky/20' : ''
                }`}
                onClick={() => !isEditing && !isDeleting && handleSelectProject(project.id)}
              >
                {/* Project Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-1 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-sky-light/50 text-lg font-semibold"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description"
                          className="w-full px-3 py-1 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-sky-light/50 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="p-1 text-green-400 hover:text-green-300"
                          >
                            <FiCheck />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 text-white/40 hover:text-white/60"
                          >
                            <FiX />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold truncate">{project.name}</h3>
                        {project.description && (
                          <p className="text-white/50 text-sm mt-1 line-clamp-2">{project.description}</p>
                        )}
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleStartEdit(project)}
                        className="p-2 text-white/40 hover:text-white/80 transition-colors"
                        title="Edit project"
                      >
                        <FiEdit2 className="text-sm" />
                      </button>
                      <button
                        onClick={() => handleExportProject(project)}
                        className="p-2 text-white/40 hover:text-white/80 transition-colors"
                        title="Export to file"
                      >
                        <FiUploadCloud className="text-sm" />
                      </button>
                      {hasDriveConfig && (
                        <button
                          onClick={() => handleSyncToDrive(project)}
                          disabled={isSyncing}
                          className={`p-2 transition-colors ${isSyncing ? 'text-sky-lighter animate-spin' : 'text-white/40 hover:text-green-400'}`}
                          title="Sync to Google Drive"
                        >
                          <FiRefreshCw className="text-sm" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirmId(project.id)}
                        className="p-2 text-white/40 hover:text-red-400 transition-colors"
                        title="Delete project"
                      >
                        <FiTrash2 className="text-sm" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete Confirmation */}
                {isDeleting && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-sm text-red-300 mb-2">Delete this project and all its data?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-sm hover:bg-red-500/30"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-1 glass rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="flex items-center gap-2 text-white/50 text-sm">
                    <FiFileText className="flex-shrink-0" />
                    <span>{project.assessments.length} assess.</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/50 text-sm">
                    <FiFolder className="flex-shrink-0" />
                    <span>{project.regulatoryFiles.length + project.entityDocuments.length} docs</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/50 text-sm">
                    <FiFileText className="flex-shrink-0" />
                    <span>{project.analyses.length} analyses</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="flex items-center gap-1 text-white/30 text-xs">
                    <FiClock />
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {project.lastSyncedAt && (
                      <span className="text-xs px-2 py-1 bg-green-500/10 text-green-400/70 rounded-full" title={`Last synced: ${new Date(project.lastSyncedAt).toLocaleString()}`}>
                        Synced
                      </span>
                    )}
                    {isActive && (
                      <span className="text-xs px-2 py-1 bg-sky/20 text-sky-lighter rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
