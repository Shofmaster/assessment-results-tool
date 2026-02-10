import { useState, useRef, useEffect } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useAppStore } from '../store/appStore';
import { useProjects, useCreateProject, useIsAdmin, useUpsertUserSettings } from '../hooks/useConvexData';
import { FiHome, FiFolder, FiFileText, FiUsers, FiSettings, FiChevronDown, FiBriefcase, FiPlus, FiRefreshCw, FiLogOut, FiShield } from 'react-icons/fi';

export default function Sidebar() {
  const currentView = useAppStore((state) => state.currentView);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);

  const projects = (useProjects() || []) as any[];
  const createProject = useCreateProject();
  const isAdmin = useIsAdmin();
  const upsertSettings = useUpsertUserSettings();
  const { user } = useUser();
  const { signOut } = useClerk();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p: any) => p._id === activeProjectId);

  // Auto-select first project if none selected
  useEffect(() => {
    if (projects.length > 0 && !activeProjectId) {
      setActiveProjectId(projects[0]._id);
    }
  }, [projects, activeProjectId, setActiveProjectId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setShowQuickCreate(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleQuickCreate = async () => {
    if (!quickCreateName.trim()) return;
    const projectId = await createProject({ name: quickCreateName.trim() });
    setQuickCreateName('');
    setShowQuickCreate(false);
    setDropdownOpen(false);
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(() => {});
    if (currentView === 'projects') setCurrentView('dashboard');
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(() => {});
    setDropdownOpen(false);
    if (currentView === 'projects') setCurrentView('dashboard');
  };

  const menuItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: FiHome },
    { id: 'library' as const, label: 'Library', icon: FiFolder },
    { id: 'analysis' as const, label: 'Analysis', icon: FiFileText },
    { id: 'audit' as const, label: 'Audit Sim', icon: FiUsers },
    { id: 'revisions' as const, label: 'Revisions', icon: FiRefreshCw },
    { id: 'projects' as const, label: 'Projects', icon: FiBriefcase },
    { id: 'settings' as const, label: 'Settings', icon: FiSettings },
  ];

  return (
    <aside className="w-64 bg-navy-900 border-r border-white/10 flex flex-col">
      <div className="p-6">
        <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Assessment Analyzer
        </h1>
        <p className="text-sky-lighter/70 text-sm mt-1">Aviation Quality</p>
      </div>

      {/* Project Switcher */}
      <div className="px-3 mb-4" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between px-4 py-3 glass rounded-xl hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FiBriefcase className="text-sky-lighter flex-shrink-0" />
            <span className="text-sm font-medium truncate">
              {activeProject ? activeProject.name : 'No Project Selected'}
            </span>
          </div>
          <FiChevronDown className={`text-white/40 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="mt-1 glass rounded-xl border border-white/10 overflow-hidden z-50 relative">
            <div className="max-h-48 overflow-y-auto">
              {projects.map((project: any) => (
                <button
                  key={project._id}
                  onClick={() => handleSelectProject(project._id)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    project._id === activeProjectId
                      ? 'bg-sky/20 text-sky-lighter'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="truncate font-medium">{project.name}</div>
                  {project.description && (
                    <div className="truncate text-xs text-white/40">{project.description}</div>
                  )}
                </button>
              ))}
              {projects.length === 0 && (
                <div className="px-4 py-3 text-sm text-white/40 text-center">No projects yet</div>
              )}
            </div>

            <div className="border-t border-white/10">
              {showQuickCreate ? (
                <div className="p-2">
                  <input
                    type="text"
                    value={quickCreateName}
                    onChange={(e) => setQuickCreateName(e.target.value)}
                    placeholder="Project name..."
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-sky-light/50"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleQuickCreate();
                      if (e.key === 'Escape') { setShowQuickCreate(false); setQuickCreateName(''); }
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowQuickCreate(true)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-sky-lighter hover:bg-white/5 transition-colors"
                >
                  <FiPlus className="text-xs" />
                  <span>New Project</span>
                </button>
              )}
              <button
                onClick={() => { setDropdownOpen(false); setCurrentView('projects'); }}
                className="w-full px-4 py-2 text-sm text-white/50 hover:bg-white/5 hover:text-white/70 transition-colors border-t border-white/10"
              >
                Manage Projects
              </button>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="text-xl" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}

        {isAdmin && (
          <button
            onClick={() => setCurrentView('admin')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${
              currentView === 'admin'
                ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <FiShield className="text-xl" />
            <span className="font-medium">Admin</span>
          </button>
        )}
      </nav>

      <div className="p-4 border-t border-white/10">
        {user ? (
          <div className="flex items-center gap-3">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium flex-shrink-0">
                {(user.fullName || user.primaryEmailAddress?.emailAddress || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.fullName || user.primaryEmailAddress?.emailAddress}</div>
              <div className="text-xs text-white/40 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
            >
              <FiLogOut />
            </button>
          </div>
        ) : (
          <div className="text-xs text-white/40 text-center">
            v2.0.0 · Powered by Claude
          </div>
        )}
      </div>
    </aside>
  );
}
