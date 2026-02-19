import { useState, useRef } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiCheck, FiX, FiClock, FiDownload } from 'react-icons/fi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, useUpsertUserSettings } from '../hooks/useConvexData';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard, Input, Badge } from './ui';

export default function ProjectManager() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const projects = (useProjects() || []) as any[];
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const upsertSettings = useUpsertUserSettings();
  const convex = useConvex();
  const navigate = useNavigate();

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const projectId = await createProject({ name: newName.trim(), description: newDescription.trim() || undefined });
    setNewName('');
    setNewDescription('');
    setShowCreate(false);
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(() => {});
    navigate('/');
  };

  const handleStartEdit = (project: { _id: string; name: string; description?: string | null }) => {
    setEditingId(project._id);
    setEditName(project.name);
    setEditDescription(project.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateProject({ projectId: editingId as any, name: editName.trim(), description: editDescription.trim() || undefined });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteProject({ projectId: id as any });
    setDeleteConfirmId(null);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      upsertSettings({ activeProjectId: undefined }).catch(() => {});
    }
  };

  const handleSelectProject = (id: string) => {
    setActiveProjectId(id);
    upsertSettings({ activeProjectId: id as any }).catch(() => {});
    navigate('/');
  };

  const handleExportProject = async (e: React.MouseEvent, projectId: string, projectName: string) => {
    e.stopPropagation();
    try {
      const bundle = await convex.query(api.projects.exportBundle, { projectId: projectId as any });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/[^a-zA-Z0-9-_ ]/g, '')}.aqp.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(getConvexErrorMessage(err));
    }
  };

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            Projects
          </h1>
          <p className="text-white/60 text-lg">
            Organize your assessments, documents, and analyses into projects
          </p>
          <p className="text-white/70 text-sm mt-1">
            Export projects periodically (download icon) to keep a local backup. Export includes metadata and extracted text; keep original files separately if needed.
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setShowCreate(true)}
            icon={<FiPlus />}
            className="w-full sm:w-auto"
          >
            New Project
          </Button>
        </div>
      </div>

      {showCreate && (
        <GlassCard className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Create New Project</h3>
          <div className="space-y-4">
            <Input
              label="Project Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Q4 2025 Audit — Acme Aviation"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Input
              label="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief description of the project scope"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="w-full sm:w-auto"
              >
                Create Project
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowCreate(false); setNewName(''); setNewDescription(''); }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {projects.length === 0 && !showCreate ? (
        <GlassCard padding="xl" className="text-center">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">No Projects Yet</h2>
          <p className="text-white/60 mb-6">
            Create your first project to start organizing assessments and documents
          </p>
          <Button size="lg" onClick={() => setShowCreate(true)}>
            Create Your First Project
          </Button>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project: any) => {
            const isActive = project._id === activeProjectId;
            const isEditing = editingId === project._id;
            const isDeleting = deleteConfirmId === project._id;

            return (
              <GlassCard
                key={project._id}
                className={`transition-all duration-300 hover:transform hover:scale-[1.02] cursor-pointer ${
                  isActive ? 'ring-2 ring-sky-light/50 shadow-lg shadow-sky/20' : ''
                }`}
                onClick={() => !isEditing && !isDeleting && handleSelectProject(project._id)}
              >
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
                            className="p-1 text-white/70 hover:text-white/60"
                          >
                            <FiX />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold truncate">{project.name}</h3>
                        {project.description && (
                          <p className="text-white/70 text-sm mt-1 line-clamp-2">{project.description}</p>
                        )}
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleExportProject(e, project._id, project.name)}
                        className="p-2 text-white/70 hover:text-sky-lighter transition-colors"
                        title="Export project (recommended periodically for backup)"
                      >
                        <FiDownload className="text-sm" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(project)}
                        className="p-2 text-white/70 hover:text-white/80 transition-colors"
                        title="Edit project"
                      >
                        <FiEdit2 className="text-sm" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(project._id)}
                        className="p-2 text-white/70 hover:text-red-400 transition-colors"
                        title="Delete project"
                      >
                        <FiTrash2 className="text-sm" />
                      </button>
                    </div>
                  )}
                </div>

                {isDeleting && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-sm text-red-300 mb-2">Delete this project and all its data?</p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(project._id)}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    <FiClock />
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {isActive && (
                    <Badge variant="info" pill>Active</Badge>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
