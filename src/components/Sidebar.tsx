import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useAppStore } from '../store/appStore';
import { useProjects, useCreateProject, useIsAdmin, useUpsertUserSettings } from '../hooks/useConvexData';
import {
  FiHome,
  FiFolder,
  FiFileText,
  FiUsers,
  FiSettings,
  FiChevronDown,
  FiBriefcase,
  FiPlus,
  FiRefreshCw,
  FiLogOut,
  FiShield,
  FiX,
  FiCheckSquare,
  FiList,
  FiAlertTriangle,
} from 'react-icons/fi';

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onNavigate?: () => void;
};

export default function Sidebar({ mobileOpen = false, onMobileClose, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
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

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  // Reset dropdown state when mobile drawer closes
  useEffect(() => {
    if (!mobileOpen) {
      setDropdownOpen(false);
      setShowQuickCreate(false);
    }
  }, [mobileOpen]);

  const handleQuickCreate = async () => {
    if (!quickCreateName.trim()) return;
    const projectId = await createProject({ name: quickCreateName.trim() });
    setQuickCreateName('');
    setShowQuickCreate(false);
    setDropdownOpen(false);
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(() => {});
    if (location.pathname === '/projects') navigate('/');
    onNavigate?.();
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(() => {});
    setDropdownOpen(false);
    if (location.pathname === '/projects') navigate('/');
    onNavigate?.();
  };

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: FiHome },
    { path: '/guided-audit', label: 'Guided Audit', icon: FiList },
    { path: '/library', label: 'Library', icon: FiFolder },
    { path: '/analysis', label: 'Analysis', icon: FiFileText },
    { path: '/audit', label: 'Audit Simulation', icon: FiUsers },
    { path: '/review', label: 'Paperwork Review', icon: FiCheckSquare },
    { path: '/entity-issues', label: 'Entity issues', icon: FiAlertTriangle },
    { path: '/revisions', label: 'Revisions', icon: FiRefreshCw },
    { path: '/projects', label: 'Projects', icon: FiBriefcase },
    { path: '/settings', label: 'Settings', icon: FiSettings },
  ];

  const sidebarContent = (
    <>
      <div className="p-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            AeroGap
          </h1>
          <p className="text-sky-lighter/70 text-sm mt-1">Aviation Quality</p>
        </div>
        <button
          type="button"
          onClick={() => onMobileClose?.()}
          className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close menu"
        >
          <FiX className="text-lg" />
        </button>
      </div>

      {/* Project Switcher */}
      <div className="px-3 mb-4" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between px-4 py-3 glass rounded-xl hover:bg-white/10 transition-colors"
          type="button"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FiBriefcase className="text-sky-lighter flex-shrink-0" />
            <span className="text-sm font-medium truncate">
              {activeProject ? activeProject.name : 'No Project Selected'}
            </span>
          </div>
          <FiChevronDown className={`text-white/70 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="mt-1 glass rounded-xl border border-white/10 overflow-hidden z-50 relative">
            <div className="max-h-48 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
              {projects.map((project: any) => (
                <button
                  key={project._id}
                  type="button"
                  onClick={() => handleSelectProject(project._id)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    project._id === activeProjectId
                      ? 'bg-sky/20 text-sky-lighter'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="truncate font-medium">{project.name}</div>
                  {project.description && (
                    <div className="truncate text-xs text-white/70">{project.description}</div>
                  )}
                </button>
              ))}
              {projects.length === 0 && (
                <div className="px-4 py-3 text-sm text-white/70 text-center">No projects yet</div>
              )}
            </div>

            <div className="border-t border-white/10" onMouseDown={(e) => e.stopPropagation()}>
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
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-sky-lighter hover:bg-white/5 transition-colors"
                >
                  <FiPlus className="text-xs" />
                  <span>New Project</span>
                </button>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setDropdownOpen(false);
                  navigate('/projects');
                  onNavigate?.();
                }}
                className="w-full px-4 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white/70 transition-colors border-t border-white/10"
              >
                Manage Projects
              </button>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3" aria-label="Main navigation">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const shortcut = index < 7 ? `Ctrl+${index + 1}` : null;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => onNavigate?.()}
              title={shortcut ? `${item.label} (${shortcut})` : item.label}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="text-xl" />
              <span className="font-medium">{item.label}</span>
              {shortcut && (
                <span className="ml-auto text-xs text-white/70 font-normal" aria-hidden>
                  {shortcut}
                </span>
              )}
            </NavLink>
          );
        })}

        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <FiShield className="text-xl" />
            <span className="font-medium">Admin</span>
          </NavLink>
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
              <div className="text-xs text-white/70 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </div>
            </div>
            <button
              onClick={() => {
                signOut();
                onNavigate?.();
              }}
              title="Sign Out"
              className="text-white/60 hover:text-white/60 transition-colors flex-shrink-0"
              type="button"
            >
              <FiLogOut />
            </button>
          </div>
        ) : (
          <div className="text-xs text-white/70 text-center">
            v2.0.0 · Powered by Claude
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-navy-900 border-r border-white/10 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => onMobileClose?.()}
        />
        <aside
          id="mobile-sidebar"
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy-900 border-r border-white/10 flex flex-col transform transition-transform duration-200 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
