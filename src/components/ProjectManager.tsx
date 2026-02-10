import { useState } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiCheck, FiX, FiClock } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, useUpsertUserSettings } from '../hooks/useConvexData';

export default function ProjectManager() {
  const projects = (useProjects() || []) as any[];
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const upsertSettings = useUpsertUserSettings();

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

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
    setCurrentView('dashboard');
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
    setCurrentView('dashboard');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
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
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all"
          >
            <FiPlus />
            <span>New Project</span>
          </button>
        </div>
      </div>

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
          {projects.map((project: any) => {
            const isActive = project._id === activeProjectId;
            const isEditing = editingId === project._id;
            const isDeleting = deleteConfirmId === project._id;

            return (
              <div
                key={project._id}
                className={`glass rounded-2xl p-6 transition-all duration-300 hover:transform hover:scale-[1.02] cursor-pointer ${
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
                        onClick={() => setDeleteConfirmId(project._id)}
                        className="p-2 text-white/40 hover:text-red-400 transition-colors"
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
                      <button
                        onClick={() => handleDelete(project._id)}
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

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="flex items-center gap-1 text-white/30 text-xs">
                    <FiClock />
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {isActive && (
                    <span className="text-xs px-2 py-1 bg-sky/20 text-sky-lighter rounded-full">
                      Active
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
