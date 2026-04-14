import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FiArrowLeft, FiTrash2 } from 'react-icons/fi';
import {
  useCreateProject,
  useDeleteProject,
  useIsAerogapEmployee,
  useProjectsForCompanyManagement,
  useUpsertUserSettings,
  useUserSettings,
} from '../hooks/useConvexData';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { useTheme } from '../context/ThemeContext';

type ProjectRow = {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
};

export default function CompanyProjectsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);

  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const isStaff = useIsAerogapEmployee();
  const settings = useUserSettings();
  const activeCompanyId = settings?.activeCompanyId as string | undefined;
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const data = useProjectsForCompanyManagement(companyId);
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const upsertSettings = useUpsertUserSettings();

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteTypedName, setDeleteTypedName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const openDelete = (p: ProjectRow) => {
    setDeleteTarget(p);
    setDeleteAck(false);
    setDeleteTypedName('');
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteAck(false);
    setDeleteTypedName('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !companyId) return;
    setCreating(true);
    try {
      await createProject({
        name,
        description: newDescription.trim() || undefined,
        companyId: companyId as any,
      });
      setNewName('');
      setNewDescription('');
      toast.success('Project created');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not create project');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    try {
      await upsertSettings({ activeProjectId: projectId as any });
      toast.success('Active project updated');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save selection');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !deleteAck || deleting) return;
    if (deleteTypedName.trim() !== deleteTarget.name.trim()) return;
    if (activeProjectId === deleteTarget._id) {
      toast.error('Switch to another project in the sidebar before deleting this one.');
      return;
    }
    setDeleting(true);
    try {
      await deleteProject({
        projectId: deleteTarget._id as any,
        confirmName: deleteTypedName.trim(),
      });
      toast.success('Project deleted');
      closeDelete();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not delete project');
    } finally {
      setDeleting(false);
    }
  };

  const textMuted = isDarkMode ? 'text-white/65' : 'text-slate-600';
  const textBody = isDarkMode ? 'text-white/90' : 'text-slate-800';
  const cardClass = isDarkMode
    ? 'rounded-xl border border-white/10 bg-navy-900/40'
    : 'rounded-xl border border-slate-200/90 bg-white/80 shadow-sm';

  if (!companyId) {
    return (
      <div ref={containerRef} className="min-h-full p-4 sm:p-6 lg:p-8">
        <p className={`text-sm ${textMuted}`}>Missing company in URL.</p>
        <Link to="/settings" className="text-sky-lighter text-sm mt-2 inline-block hover:underline">
          Back to settings
        </Link>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div ref={containerRef} className="min-h-full p-4 sm:p-6 lg:p-8">
        <div className={`text-sm ${textMuted}`}>Loading projects…</div>
      </div>
    );
  }

  if (data.forbidden) {
    return (
      <div ref={containerRef} className="min-h-full p-4 sm:p-6 lg:p-8 max-w-2xl">
        <h1 className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Company projects</h1>
        <p className={`text-sm mt-2 ${textMuted}`}>
          You do not have permission to manage projects for this organization, or the company does not exist.
        </p>
        <Link
          to={isStaff ? '/companies' : '/settings'}
          className="inline-flex items-center gap-2 mt-4 text-sm text-sky-lighter hover:underline"
        >
          <FiArrowLeft /> {isStaff ? 'Back to companies' : 'Back to settings'}
        </Link>
      </div>
    );
  }

  const { company, projects } = data;
  const nameMatchesDelete =
    deleteTarget != null && deleteTypedName.trim() === deleteTarget.name.trim();
  const deleteBlockedByActive = deleteTarget != null && activeProjectId === deleteTarget._id;

  return (
    <div ref={containerRef} className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <Link
              to={isStaff ? '/companies' : '/settings'}
              className={`inline-flex items-center gap-1.5 text-xs font-medium mb-2 ${isDarkMode ? 'text-sky-lighter hover:text-white' : 'text-sky-700 hover:text-sky-900'}`}
            >
              <FiArrowLeft className="text-sm" />
              {isStaff ? 'Companies' : 'Settings'}
            </Link>
            <h1 className={`text-2xl sm:text-3xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Projects — {company.name}
            </h1>
            <p className={`text-sm mt-1 ${textMuted}`}>
              Create projects for this company. Deleting a project permanently removes related evidence, CARs, logbooks,
              and other data.
            </p>
            {isStaff && activeCompanyId === companyId && (
              <p className={`text-xs mt-2 ${isDarkMode ? 'text-sky-lighter/90' : 'text-sky-800'}`}>
                This company matches your current sidebar scope.
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleCreate} className={`${cardClass} p-4 sm:p-5 space-y-3`}>
          <h2 className={`text-lg font-medium ${textBody}`}>New project</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cp-name" className={`block text-xs font-medium mb-1 ${textMuted}`}>
                Name
              </label>
              <input
                id="cp-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 ${
                  isDarkMode
                    ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
                placeholder="e.g. Line maintenance — Hangar A"
                required
              />
            </div>
            <div>
              <label htmlFor="cp-desc" className={`block text-xs font-medium mb-1 ${textMuted}`}>
                Description (optional)
              </label>
              <input
                id="cp-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-sky/40 ${
                  isDarkMode
                    ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
                placeholder="Short note for your team"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky text-white hover:bg-sky-light disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {creating ? 'Creating…' : 'Create project'}
          </button>
        </form>

        <div className={`${cardClass} overflow-hidden`}>
          <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/80'}`}>
            <h2 className={`text-lg font-medium ${textBody}`}>Existing projects ({projects.length})</h2>
          </div>
          {projects.length === 0 ? (
            <div className={`px-4 py-10 text-center text-sm ${textMuted}`}>No projects yet for this company.</div>
          ) : (
            <ul className={isDarkMode ? 'divide-y divide-white/10' : 'divide-y divide-slate-200'}>
              {(projects as ProjectRow[]).map((p) => (
                <li
                  key={p._id}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 ${
                    isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`font-medium truncate ${textBody}`}>{p.name}</div>
                    {p.description ? (
                      <div className={`text-xs truncate mt-0.5 ${textMuted}`}>{p.description}</div>
                    ) : null}
                    <div className={`text-[11px] mt-1 tabular-nums ${textMuted}`}>
                      Created {new Date(p.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectProject(p._id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        isDarkMode
                          ? 'border-sky-light/40 bg-sky/15 text-sky-lighter hover:bg-sky/25'
                          : 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100'
                      }`}
                    >
                      Use in sidebar
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(p)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        isDarkMode
                          ? 'border-red-400/35 text-red-300 hover:bg-red-500/10'
                          : 'border-red-200 text-red-700 hover:bg-red-50'
                      }`}
                    >
                      <FiTrash2 className="text-sm" />
                      Delete…
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDelete();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl border p-5 shadow-xl ${
              isDarkMode ? 'border-white/15 bg-navy-900 text-white' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <h2 id="delete-project-title" className="text-lg font-semibold">
              Delete project permanently?
            </h2>
            <p className={`text-sm mt-2 ${isDarkMode ? 'text-white/75' : 'text-slate-600'}`}>
              This will permanently remove documents, CARs, logbooks, checklists, and all other data tied to{' '}
              <span className="font-medium">"{deleteTarget.name}"</span>. This cannot be undone.
            </p>
            {deleteBlockedByActive && (
              <p className="text-sm mt-3 text-amber-600 dark:text-amber-300">
                This project is currently selected in the sidebar. Choose another project there first, then return here
                to delete.
              </p>
            )}
            <label className={`flex items-start gap-2 mt-4 text-sm cursor-pointer ${textBody}`}>
              <input
                type="checkbox"
                checked={deleteAck}
                onChange={(e) => setDeleteAck(e.target.checked)}
                className="mt-0.5 rounded border-slate-400"
              />
              <span>I understand this action is permanent and cannot be undone.</span>
            </label>
            <div className="mt-4">
              <label htmlFor="delete-confirm-name" className={`block text-xs font-medium mb-1 ${textMuted}`}>
                Type the project name to confirm
              </label>
              <input
                id="delete-confirm-name"
                value={deleteTypedName}
                onChange={(e) => setDeleteTypedName(e.target.value)}
                autoComplete="off"
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40 ${
                  isDarkMode
                    ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
                placeholder={deleteTarget.name}
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  isDarkMode ? 'border-white/20 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={
                  deleting || !deleteAck || !nameMatchesDelete || deleteBlockedByActive
                }
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:pointer-events-none"
              >
                {deleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
