import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FiBriefcase, FiChevronDown, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useCompaniesForCurrentUser,
  useCreateProject,
  useDeleteProject,
  useIsAerogapEmployee,
  useProjects,
  useUpsertUserSettings,
  useUserSettings,
} from '../hooks/useConvexData';
import { PROJECT_SCOPE_COPY } from '../config/projectScopeCopy';
import { useConfirmDialog } from './confirm/ConfirmDialogProvider';
import { ReadinessDot } from './ReadinessDot';
import type { ScopeReadinessLevel } from '../utils/readinessSeverity';

/** Surface (rather than swallow) workspace-preference persistence failures. */
const toastSettingsSaveFailed = () =>
  toast.error('Could not save your workspace preference — it may reset on reload.', {
    id: 'workspace-pref-save',
  });

export type CompanyProjectSwitcherProps = {
  isDarkMode: boolean;
  mobileOpen: boolean;
  onNavigate?: () => void;
  /** From parent `useReadinessSummary` so we do not duplicate the query. */
  scopeLevel: ScopeReadinessLevel;
};

export function CompanyProjectSwitcher({
  isDarkMode,
  mobileOpen,
  onNavigate,
  scopeLevel,
}: CompanyProjectSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);

  const projects = (useProjects() || []) as any[];
  const companies = (useCompaniesForCurrentUser() || []) as any[];
  const createProject = useCreateProject();
  const deleteProjectMutation = useDeleteProject();
  const isAerogapEmployee = useIsAerogapEmployee();
  const upsertSettings = useUpsertUserSettings();
  const confirmDialog = useConfirmDialog();
  const userSettings = useUserSettings();
  const activeCompanyIdFromSettings = userSettings?.activeCompanyId as string | undefined;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companySearch, setCompanySearch] = useState('');
  const [quickCreateName, setQuickCreateName] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filteredProjects = !isAerogapEmployee
    ? projects
    : activeCompanyIdFromSettings
      ? projects.filter(
          (p: any) =>
            p.companyId != null &&
            String(p.companyId) === String(activeCompanyIdFromSettings),
        )
      : [];

  const projectsForSelection = filteredProjects;
  const activeProject = projects.find((p: any) => p._id === activeProjectId);

  const companyIdForProjectManagement = isAerogapEmployee
    ? activeCompanyIdFromSettings
    : activeProject?.companyId
      ? String(activeProject.companyId)
      : selectedCompanyId ||
        (companies.length === 1 ? String((companies[0] as any)._id) : undefined);

  useEffect(() => {
    if (!isAerogapEmployee) return;
    if (userSettings === undefined) return;
    if (activeCompanyIdFromSettings) return;
    if (!companies.length) return;
    const firstId = (companies[0] as any)._id;
    upsertSettings({ activeCompanyId: firstId as any }).catch(toastSettingsSaveFailed);
  }, [isAerogapEmployee, userSettings, activeCompanyIdFromSettings, companies, upsertSettings]);

  useEffect(() => {
    if (userSettings === undefined) return;

    if (projectsForSelection.length === 0) {
      if (activeProjectId) {
        setActiveProjectId(null);
        upsertSettings({ activeProjectId: null }).catch(toastSettingsSaveFailed);
      }
      return;
    }

    const stillExists = activeProjectId
      ? projectsForSelection.some((p: any) => p._id === activeProjectId)
      : false;

    if (!activeProjectId || !stillExists) {
      const saved = userSettings?.activeProjectId as string | undefined;
      const preferSaved = Boolean(
        saved && projectsForSelection.some((p: any) => p._id === saved),
      );
      const fallbackId = preferSaved ? saved! : projectsForSelection[0]._id;
      setActiveProjectId(fallbackId);
      if (!preferSaved || fallbackId !== saved) {
        upsertSettings({ activeProjectId: fallbackId as any }).catch(toastSettingsSaveFailed);
      }
    }
  }, [
    projectsForSelection,
    activeProjectId,
    setActiveProjectId,
    upsertSettings,
    userSettings,
  ]);

  useEffect(() => {
    setDropdownOpen(false);
    setShowQuickCreate(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      setDropdownOpen(false);
      setShowQuickCreate(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setShowQuickCreate(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      setDropdownOpen(false);
      setShowQuickCreate(false);
    }
  }, [mobileOpen]);

  const projectButtonClass = isDarkMode
    ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06]'
    : 'bg-slate-100/80 hover:bg-slate-100 border-slate-300/70';
  const projectButtonTextClass = isDarkMode ? 'text-white/80' : 'text-slate-700';
  const projectIconClass = isDarkMode ? 'text-sky-lighter/70' : 'text-sky-700';
  const chevronClass = isDarkMode ? 'text-white/40' : 'text-slate-400';
  const compactIconClass = 'text-sm';
  const topControlButtonClass = isDarkMode
    ? 'inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors'
    : 'inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-300/70 bg-slate-100/80 hover:bg-slate-100 transition-colors';

  const handleQuickCreate = async () => {
    if (!quickCreateName.trim()) return;
    if (isAerogapEmployee && !activeCompanyIdFromSettings) return;
    const projectId = await createProject({
      name: quickCreateName.trim(),
      companyId: isAerogapEmployee
        ? (activeCompanyIdFromSettings as any)
        : selectedCompanyId || undefined,
    } as any);
    setQuickCreateName('');
    setShowQuickCreate(false);
    setDropdownOpen(false);
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(toastSettingsSaveFailed);
    if (location.pathname === '/projects') navigate('/logbook');
    onNavigate?.();
  };

  const handleSelectProject = async (projectId: string) => {
    const id = String(projectId);
    setActiveProjectId(id);
    try {
      await upsertSettings({ activeProjectId: id as any });
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not switch project');
    }
    setDropdownOpen(false);
    if (location.pathname === '/projects') navigate('/logbook');
    onNavigate?.();
  };

  const handleDeletePersonalProject = async (project: {
    _id: string;
    name: string;
    companyId?: string;
  }) => {
    if (project.companyId) return;
    const ok = await confirmDialog({
      title: 'Delete project?',
      message: `Permanently delete personal project "${project.name}"? This removes all related data. This cannot be undone.`,
      confirmLabel: 'Delete project',
      requireText: project.name.trim(),
    });
    if (!ok) return;
    try {
      await deleteProjectMutation({ projectId: project._id as any, confirmName: project.name.trim() });
      toast.success('Project deleted');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not delete project');
    }
  };

  return (
    <div className="px-3 mb-3 shrink-0 relative z-10" ref={rootRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`w-full flex items-center justify-between px-3 min-h-9 py-1.5 rounded-lg border transition-colors ${projectButtonClass}`}
        aria-expanded={dropdownOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FiBriefcase className={`text-[15px] flex-shrink-0 ${projectIconClass}`} />
          <span className={`text-sm font-medium min-w-0 ${projectButtonTextClass}`}>
            {isAerogapEmployee ? (
              <>
                <span className="flex items-center gap-1.5 min-w-0 leading-tight">
                  <span className="truncate min-w-0">
                    {companies.find(
                      (c: any) => String(c._id) === String(activeCompanyIdFromSettings ?? ''),
                    )?.name ?? 'Company'}
                  </span>
                  <ReadinessDot level={scopeLevel} isDarkMode={isDarkMode} />
                </span>
                <span
                  className={`block truncate text-xs font-normal ${
                    isDarkMode ? 'text-white/55' : 'text-slate-500'
                  }`}
                >
                  {activeProject ? activeProject.name : PROJECT_SCOPE_COPY.noProjectSelected}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate min-w-0">
                  {activeProject ? activeProject.name : PROJECT_SCOPE_COPY.noProjectSelected}
                </span>
                <ReadinessDot level={scopeLevel} isDarkMode={isDarkMode} />
              </span>
            )}
          </span>
        </div>
        <FiChevronDown
          className={`${chevronClass} ${compactIconClass} flex-shrink-0 transition-transform ${
            dropdownOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {dropdownOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1 z-[9999] max-h-[min(70vh,32rem)] overflow-y-auto overflow-x-hidden rounded-lg backdrop-blur-lg border shadow-xl scrollbar-thin ${
            isDarkMode
              ? 'bg-navy-800/95 border-white/[0.08] shadow-black/30'
              : 'bg-white border-slate-200 shadow-slate-300/35'
          }`}
        >
          {isAerogapEmployee ? (
            <>
              <div
                className="p-2 border-b border-white/10 space-y-2"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  type="search"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Search companies..."
                  className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 focus:border-sky-light/50'
                      : 'bg-white border-slate-300 focus:border-sky'
                  }`}
                />
                <div className="max-h-28 overflow-y-auto scrollbar-thin space-y-0.5">
                  {companies
                    .filter(
                      (c: any) =>
                        !companySearch ||
                        (c.name || '').toLowerCase().includes(companySearch.trim().toLowerCase()),
                    )
                    .map((company: any) => (
                      <button
                        key={company._id}
                        type="button"
                        onClick={async () => {
                          try {
                            await upsertSettings({ activeCompanyId: company._id as any });
                            setCompanySearch('');
                            setDropdownOpen(false);
                            toast.success(`Company: ${company.name}`);
                          } catch (err: any) {
                            toast.error(err?.message ?? 'Could not switch company');
                          }
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
                          String(company._id) === String(activeCompanyIdFromSettings ?? '')
                            ? isDarkMode
                              ? 'bg-sky/25 text-sky-lighter'
                              : 'bg-sky-100 text-sky-900'
                            : isDarkMode
                              ? 'text-white/75 hover:bg-white/5'
                              : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-medium truncate block">{company.name}</span>
                      </button>
                    ))}
                  {!companies.length && (
                    <div className={`px-3 py-2 text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
                      No companies
                    </div>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto scrollbar-thin" onMouseDown={(e) => e.stopPropagation()}>
                {projectsForSelection.map((project: any) => (
                  <button
                    key={project._id}
                    type="button"
                    onClick={() => void handleSelectProject(project._id)}
                    className={`w-full text-left border-b last:border-b-0 px-4 py-2 text-sm transition-colors ${
                      isDarkMode ? 'border-white/[0.06]' : 'border-slate-200'
                    } ${
                      project._id === activeProjectId
                        ? isDarkMode
                          ? 'bg-sky/20 text-sky-lighter'
                          : 'bg-sky-100 text-sky-800'
                        : isDarkMode
                          ? 'text-white/70 hover:bg-white/5 hover:text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="truncate font-medium">{project.name}</div>
                    {project.description && (
                      <div className={`truncate text-xs ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
                        {project.description}
                      </div>
                    )}
                  </button>
                ))}
                {projectsForSelection.length === 0 && (
                  <div className={`px-4 py-3 text-sm text-center ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
                    {activeCompanyIdFromSettings
                      ? PROJECT_SCOPE_COPY.emptyListStaffScoped
                      : PROJECT_SCOPE_COPY.emptyListStaffNoCompany}
                    <span className={`block text-xs mt-1 ${isDarkMode ? 'text-white/50' : 'text-slate-400'}`}>
                      {PROJECT_SCOPE_COPY.projectMenuHint}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="max-h-48 overflow-y-auto scrollbar-thin" onMouseDown={(e) => e.stopPropagation()}>
              {projects.map((project: any) =>
                project.companyId ? (
                  <button
                    key={project._id}
                    type="button"
                    onClick={() => void handleSelectProject(project._id)}
                    className={`w-full text-left border-b last:border-b-0 px-4 py-2 text-sm transition-colors ${
                      isDarkMode ? 'border-white/[0.06]' : 'border-slate-200'
                    } ${
                      project._id === activeProjectId
                        ? isDarkMode
                          ? 'bg-sky/20 text-sky-lighter'
                          : 'bg-sky-100 text-sky-800'
                        : isDarkMode
                          ? 'text-white/70 hover:bg-white/5 hover:text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="truncate font-medium">{project.name}</div>
                    {project.description && (
                      <div className={`truncate text-xs ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
                        {project.description}
                      </div>
                    )}
                  </button>
                ) : (
                  <div
                    key={project._id}
                    className={`flex items-stretch border-b last:border-b-0 ${
                      isDarkMode ? 'border-white/[0.06]' : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectProject(project._id)}
                      className={`flex-1 min-w-0 text-left px-4 py-2 text-sm transition-colors ${
                        project._id === activeProjectId
                          ? isDarkMode
                            ? 'bg-sky/20 text-sky-lighter'
                            : 'bg-sky-100 text-sky-800'
                          : isDarkMode
                            ? 'text-white/70 hover:bg-white/5 hover:text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="truncate font-medium">{project.name}</div>
                      <div
                        className={`text-[10px] uppercase tracking-wide mt-0.5 ${
                          isDarkMode ? 'text-white/45' : 'text-slate-400'
                        }`}
                      >
                        Personal
                      </div>
                      {project.description && (
                        <div className={`truncate text-xs ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
                          {project.description}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Delete personal project"
                      aria-label={`Delete personal project ${project.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleDeletePersonalProject(project);
                      }}
                      className={`shrink-0 px-2 flex items-center justify-center border-l transition-colors ${
                        isDarkMode
                          ? 'border-white/[0.06] text-red-300/90 hover:bg-red-500/15'
                          : 'border-slate-200 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <FiTrash2 className="text-sm" />
                    </button>
                  </div>
                ),
              )}
              {projects.length === 0 && (
                <div className={`px-4 py-3 text-sm text-center ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
                  {PROJECT_SCOPE_COPY.emptyListTenant}
                  <span className={`block text-xs mt-1 ${isDarkMode ? 'text-white/50' : 'text-slate-400'}`}>
                    {PROJECT_SCOPE_COPY.projectMenuHint}
                  </span>
                </div>
              )}
            </div>
          )}

          {companyIdForProjectManagement && (
            <div
              className={`border-t px-2 py-2 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <NavLink
                to={`/companies/${companyIdForProjectManagement}/projects`}
                onClick={() => {
                  setDropdownOpen(false);
                  onNavigate?.();
                }}
                className={`block w-full text-center px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-white/5 text-sky-lighter hover:bg-white/10 border border-white/10'
                    : 'bg-slate-50 text-sky-800 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {PROJECT_SCOPE_COPY.manageProjectsLinkLabel}
              </NavLink>
            </div>
          )}

          <div
            className={`border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {showQuickCreate ? (
              <div className="p-2">
                {!isAerogapEmployee && companies.length > 0 && (
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className={`w-full mb-2 px-3 py-1.5 border rounded-lg text-sm focus:outline-none ${
                      isDarkMode
                        ? 'bg-white/5 border-white/10 focus:border-sky-light/50'
                        : 'bg-white border-slate-300 focus:border-sky'
                    }`}
                  >
                    <option value="">Personal / Legacy owner</option>
                    {companies.map((company: any) => (
                      <option key={company._id} value={company._id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                )}
                {isAerogapEmployee && activeCompanyIdFromSettings && (
                  <p className={`text-[11px] mb-2 ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
                    New project in current company scope
                  </p>
                )}
                <input
                  type="text"
                  value={quickCreateName}
                  onChange={(e) => setQuickCreateName(e.target.value)}
                  placeholder="Project name..."
                  className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 focus:border-sky-light/50'
                      : 'bg-white border-slate-300 focus:border-sky'
                  }`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleQuickCreate();
                    if (e.key === 'Escape') {
                      setShowQuickCreate(false);
                      setQuickCreateName('');
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowQuickCreate(true)}
                disabled={isAerogapEmployee && !activeCompanyIdFromSettings}
                className={`w-full ${topControlButtonClass} text-sm ${
                  isDarkMode ? 'text-sky-lighter' : 'text-sky-700'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <FiPlus className={compactIconClass} />
                <span>New Project</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
