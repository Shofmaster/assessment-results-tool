import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { FiHome, FiFolder, FiFileText, FiUsers, FiSettings, FiChevronDown, FiBriefcase, FiPlus, FiRefreshCw, FiLogOut } from 'react-icons/fi';

export default function Sidebar() {
  const currentView = useAppStore((state) => state.currentView);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const projects = useAppStore((state) => state.projects);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const createProject = useAppStore((state) => state.createProject);

  const currentUser = useAppStore((state) => state.currentUser);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const handleSignOut = useAppStore((state) => state.handleSignOut);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);

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

  const handleQuickCreate = () => {
    if (!quickCreateName.trim()) return;
    const project = createProject(quickCreateName.trim());
    setQuickCreateName('');
    setShowQuickCreate(false);
    setDropdownOpen(false);
    setActiveProjectId(project.id);
    if (currentView === 'projects') setCurrentView('dashboard');
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiHome },
    { id: 'library', label: 'Library', icon: FiFolder },
    { id: 'analysis', label: 'Analysis', icon: FiFileText },
    { id: 'audit', label: 'Audit Sim', icon: FiUsers },
    { id: 'revisions', label: 'Revisions', icon: FiRefreshCw },
    { id: 'projects', label: 'Projects', icon: FiBriefcase },
    { id: 'settings', label: 'Settings', icon: FiSettings },
  ] as const;

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
            {/* Project list */}
            <div className="max-h-48 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    setActiveProjectId(project.id);
                    setDropdownOpen(false);
                    if (currentView === 'projects') setCurrentView('dashboard');
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    project.id === activeProjectId
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

            {/* Quick create */}
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
      </nav>

      <div className="p-4 border-t border-white/10">
        {currentUser ? (
          <div className="flex items-center gap-3">
            {currentUser.picture ? (
              <img src={currentUser.picture} alt="" className="w-8 h-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium flex-shrink-0">
                {currentUser.name?.[0] || currentUser.email[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{currentUser.name || currentUser.email}</div>
              <div className="text-xs text-white/40 truncate flex items-center gap-1">
                {isSyncing && (
                  <FiRefreshCw className="animate-spin text-sky-light" style={{ fontSize: '10px' }} />
                )}
                <span>{currentUser.email}</span>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
            >
              <FiLogOut />
            </button>
          </div>
        ) : (
          <div className="text-xs text-white/40 text-center">
            v1.2.0 · Powered by Claude
          </div>
        )}
      </div>
    </aside>
  );
}
