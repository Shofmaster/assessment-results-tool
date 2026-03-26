import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useAppStore } from '../store/appStore';
import { useProjects, useCreateProject, useIsAdmin, useIsAerogapEmployee, useIsLogbookEnabled, useIsFeatureEnabled, useUpsertUserSettings } from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import {
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
  FiCalendar,
  FiBarChart2,
  FiBookOpen,
  FiDatabase,
  FiHelpCircle,
  FiHome,
} from 'react-icons/fi';
import { Select } from './ui';

type Section = 'audit' | 'manual-writer' | 'manual-management' | 'logbook' | 'form-337';

const SECTION_STORAGE_KEY = 'aerogap_section';

const MANUAL_WRITER_ROUTES = new Set(['/manual-writer', '/aerogap-dashboard']);
const MANUAL_MANAGEMENT_ROUTES = new Set(['/manual-management']);
const LOGBOOK_ROUTES = new Set(['/logbook']);
const FORM_337_ROUTES = new Set(['/form-337']);
const AUDIT_ROUTES = new Set([
  '/', '/guided-audit', '/library', '/analysis', '/audit', '/review',
  '/entity-issues', '/revisions', '/schedule', '/analytics', '/report', '/checklists',
]);

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
  const isAerogapEmployee = useIsAerogapEmployee();
  const isLogbookEnabled = useIsLogbookEnabled();
  const upsertSettings = useUpsertUserSettings();

  // Per-user feature flags (null/undefined = all enabled, which is the default)
  const isManualWriterEnabled = useIsFeatureEnabled(FEATURE_KEYS.MANUAL_WRITER);
  const isManualManagementEnabled = useIsFeatureEnabled(FEATURE_KEYS.MANUAL_MANAGEMENT);
  const isForm337Enabled = useIsFeatureEnabled(FEATURE_KEYS.FORM_337);
  const isAuditSimEnabled = useIsFeatureEnabled(FEATURE_KEYS.AUDIT_SIMULATION);
  const isGuidedAuditEnabled = useIsFeatureEnabled(FEATURE_KEYS.GUIDED_AUDIT);
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isLibraryEnabled = useIsFeatureEnabled(FEATURE_KEYS.LIBRARY);
  const isPaperworkReviewEnabled = useIsFeatureEnabled(FEATURE_KEYS.PAPERWORK_REVIEW);
  const isAnalysisEnabled = useIsFeatureEnabled(FEATURE_KEYS.ANALYSIS);
  const isEntityIssuesEnabled = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isRevisionsEnabled = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);
  const isScheduleEnabled = useIsFeatureEnabled(FEATURE_KEYS.SCHEDULE);
  const isAnalyticsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ANALYTICS);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const { user } = useUser();
  const { signOut } = useClerk();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getInitialSection = (): Section => {
    if (isManualWriterEnabled && MANUAL_WRITER_ROUTES.has(location.pathname)) return 'manual-writer';
    if (isManualManagementEnabled && MANUAL_MANAGEMENT_ROUTES.has(location.pathname)) return 'manual-management';
    if (isForm337Enabled && FORM_337_ROUTES.has(location.pathname)) return 'form-337';
    if (isLogbookEnabled && LOGBOOK_ROUTES.has(location.pathname)) return 'logbook';
    if (AUDIT_ROUTES.has(location.pathname)) return 'audit';
    const stored = localStorage.getItem(SECTION_STORAGE_KEY) as Section | null;
    if (stored === 'manual-writer' && isManualWriterEnabled) return stored;
    if (stored === 'manual-management' && isManualManagementEnabled) return stored;
    if (stored === 'logbook' && isLogbookEnabled) return stored;
    if (stored === 'form-337' && isForm337Enabled) return stored;
    return 'audit';
  };

  const [section, setSection] = useState<Section>(getInitialSection);

  const switchSection = (target: Section) => {
    if (target === 'logbook' && !isLogbookEnabled) return;
    if (target === 'manual-writer' && !isManualWriterEnabled) return;
    if (target === 'manual-management' && !isManualManagementEnabled) return;
    if (target === 'form-337' && !isForm337Enabled) return;
    setSection(target);
    localStorage.setItem(SECTION_STORAGE_KEY, target);
    const destinations: Record<Section, string> = {
      'audit': '/guided-audit',
      'manual-writer': '/manual-writer',
      'manual-management': '/manual-management',
      'logbook': '/logbook',
      'form-337': '/form-337',
    };
    navigate(destinations[target]);
    onNavigate?.();
  };

  const activeProject = projects.find((p: any) => p._id === activeProjectId);

  // Keep active project valid (handles deletion/access changes) and auto-select a fallback.
  useEffect(() => {
    if (projects.length === 0) {
      if (activeProjectId) {
        setActiveProjectId(null);
        upsertSettings({ activeProjectId: null }).catch(() => {});
      }
      return;
    }

    const stillExists = activeProjectId
      ? projects.some((p: any) => p._id === activeProjectId)
      : false;

    if (!activeProjectId || !stillExists) {
      const fallbackId = projects[0]._id;
      setActiveProjectId(fallbackId);
      upsertSettings({ activeProjectId: fallbackId as any }).catch(() => {});
    }
  }, [projects, activeProjectId, setActiveProjectId, upsertSettings]);

  // Sync section state when URL changes to a section-specific route
  useEffect(() => {
    if (isManualWriterEnabled && MANUAL_WRITER_ROUTES.has(location.pathname)) {
      setSection('manual-writer');
      localStorage.setItem(SECTION_STORAGE_KEY, 'manual-writer');
    } else if (isManualManagementEnabled && MANUAL_MANAGEMENT_ROUTES.has(location.pathname)) {
      setSection('manual-management');
      localStorage.setItem(SECTION_STORAGE_KEY, 'manual-management');
    } else if (isForm337Enabled && FORM_337_ROUTES.has(location.pathname)) {
      setSection('form-337');
      localStorage.setItem(SECTION_STORAGE_KEY, 'form-337');
    } else if (LOGBOOK_ROUTES.has(location.pathname) && isLogbookEnabled) {
      setSection('logbook');
      localStorage.setItem(SECTION_STORAGE_KEY, 'logbook');
    } else if (AUDIT_ROUTES.has(location.pathname)) {
      setSection('audit');
      localStorage.setItem(SECTION_STORAGE_KEY, 'audit');
    }
  }, [isLogbookEnabled, isManualWriterEnabled, isManualManagementEnabled, isForm337Enabled, location.pathname]);

  useEffect(() => {
    if (isLogbookEnabled) return;
    if (section === 'logbook') {
      setSection('audit');
      localStorage.setItem(SECTION_STORAGE_KEY, 'audit');
    }
    if (LOGBOOK_ROUTES.has(location.pathname)) {
      navigate('/guided-audit');
    }
  }, [isLogbookEnabled, location.pathname, navigate, section]);

  // Auto-redirect when feature-gated sections become disabled for this user
  useEffect(() => {
    if (!isManualWriterEnabled) {
      if (section === 'manual-writer') {
        setSection('audit');
        localStorage.setItem(SECTION_STORAGE_KEY, 'audit');
      }
      if (MANUAL_WRITER_ROUTES.has(location.pathname) && location.pathname !== '/aerogap-dashboard') {
        navigate('/guided-audit');
      }
    }
    if (!isManualManagementEnabled) {
      if (section === 'manual-management') {
        setSection('audit');
        localStorage.setItem(SECTION_STORAGE_KEY, 'audit');
      }
      if (MANUAL_MANAGEMENT_ROUTES.has(location.pathname)) {
        navigate('/guided-audit');
      }
    }
    if (!isForm337Enabled) {
      if (section === 'form-337') {
        setSection('audit');
        localStorage.setItem(SECTION_STORAGE_KEY, 'audit');
      }
      if (FORM_337_ROUTES.has(location.pathname)) {
        navigate('/guided-audit');
      }
    }
  }, [isManualWriterEnabled, isManualManagementEnabled, isForm337Enabled, location.pathname, navigate, section]);

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
    if (location.pathname === '/projects') navigate('/logbook');
    onNavigate?.();
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    upsertSettings({ activeProjectId: projectId as any }).catch(() => {});
    setDropdownOpen(false);
    if (location.pathname === '/projects') navigate('/logbook');
    onNavigate?.();
  };

  const auditItems = [
    ...(isGuidedAuditEnabled    ? [{ path: '/guided-audit',  label: 'Guided Audit',      icon: FiList         }] : []),
    ...(isLibraryEnabled        ? [{ path: '/library',       label: 'Library',           icon: FiFolder       }] : []),
    ...(isAnalysisEnabled       ? [{ path: '/analysis',      label: 'Analysis',          icon: FiFileText     }] : []),
    ...(isAuditSimEnabled       ? [{ path: '/audit',         label: 'Audit Simulation',  icon: FiUsers        }] : []),
    ...(isPaperworkReviewEnabled? [{ path: '/review',        label: 'Paperwork Review',  icon: FiCheckSquare  }] : []),
    ...(isEntityIssuesEnabled   ? [{ path: '/entity-issues', label: 'CARs & Issues',     icon: FiAlertTriangle}] : []),
    ...(isRevisionsEnabled      ? [{ path: '/revisions',     label: 'Revisions',         icon: FiRefreshCw    }] : []),
    ...(isScheduleEnabled       ? [{ path: '/schedule',      label: 'Schedule',          icon: FiCalendar     }] : []),
    ...(isAnalyticsEnabled      ? [{ path: '/analytics',     label: 'Analytics',         icon: FiBarChart2    }] : []),
    ...(isReportBuilderEnabled  ? [{ path: '/report',        label: 'Report Builder',    icon: FiBookOpen     }] : []),
    ...(isChecklistsEnabled     ? [{ path: '/checklists',    label: 'Checklists',        icon: FiCheckSquare  }] : []),
  ];

  // Manual Writer / Manuals use the section dropdown only — no cross-links here.
  const manualWriterItems: typeof auditItems = [];
  const manualManagementItems: typeof auditItems = [];
  const logbookItems = [
    { path: '/logbook', label: 'Logbook', icon: FiDatabase },
  ];

  const sharedItems = [
    { path: '/splash', label: 'Home', icon: FiHome },
    { path: '/help', label: 'Help', icon: FiHelpCircle },
    { path: '/settings', label: 'Settings', icon: FiSettings },
  ];

  const sectionItemsMap: Record<Section, typeof auditItems> = {
    'audit': auditItems,
    'manual-writer': manualWriterItems,
    'manual-management': manualManagementItems,
    'logbook': logbookItems,
    'form-337': [{ path: '/form-337', label: 'FAA Form 337', icon: FiFileText }],
  };
  const sectionOptions: Array<{ key: Section; label: string }> = [
    { key: 'audit', label: 'Audit' },
    ...(isManualWriterEnabled     ? [{ key: 'manual-writer',     label: 'Manual Writer'  } as const] : []),
    ...(isManualManagementEnabled ? [{ key: 'manual-management', label: 'Manuals'        } as const] : []),
    ...(isLogbookEnabled          ? [{ key: 'logbook',           label: 'Logbook'        } as const] : []),
    ...(isForm337Enabled          ? [{ key: 'form-337',          label: 'FAA Form 337'   } as const] : []),
  ];
  const activeSectionItems = sectionItemsMap[section];
  const sectionSpecificItems = activeSectionItems;

  const sidebarContent = (
    <>
      <div className="p-4 pb-2 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            navigate('/splash');
            onNavigate?.();
          }}
          className="text-left rounded-lg -m-1 p-1 min-w-0 hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-light/40"
          aria-label="Go to home"
        >
          <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            AeroGap
          </h1>
          <p className="text-sky-lighter/70 text-sm mt-1">Aviation Quality</p>
        </button>
        <button
          type="button"
          onClick={() => onMobileClose?.()}
          className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close menu"
        >
          <FiX className="text-lg" />
        </button>
      </div>

      {/* Section Switcher */}
      <div className="px-3 mb-2">
        <Select
          aria-label="Select section"
          value={section}
          onChange={(e) => switchSection(e.target.value as Section)}
          selectSize="sm"
          className="bg-white/[0.04] border-white/[0.10] text-white/90"
        >
          {sectionOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {/* Project Switcher */}
      <div className="px-3 mb-3" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
          type="button"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FiBriefcase className="text-sky-lighter/70 text-sm flex-shrink-0" />
            <span className="text-sm font-medium truncate text-white/80">
              {activeProject ? activeProject.name : 'No Project Selected'}
            </span>
          </div>
          <FiChevronDown className={`text-white/40 text-xs flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="mt-1 rounded-lg bg-navy-800/95 backdrop-blur-lg border border-white/[0.08] overflow-hidden z-50 relative shadow-xl shadow-black/30">
            <div className="max-h-48 overflow-y-auto scrollbar-thin" onMouseDown={(e) => e.stopPropagation()}>
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
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-0" aria-label="Main navigation">
        {sectionSpecificItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => onNavigate?.()}
              title={item.label}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="text-base flex-shrink-0" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {sectionSpecificItems.length > 0 && (
          <div className="border-t border-white/[0.06] my-2" />
        )}

        {sharedItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => onNavigate?.()}
              title={item.label}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="text-base flex-shrink-0" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {isAerogapEmployee && (
          <NavLink
            to="/aerogap-dashboard"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all text-sm ${
                isActive
                  ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <FiUsers className="text-base flex-shrink-0" />
            <span className="font-medium">Employee Dashboard</span>
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all text-sm ${
                isActive
                  ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <FiShield className="text-base flex-shrink-0" />
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
      <aside className="hidden md:flex w-52 lg:w-64 shrink-0 bg-navy-900 border-r border-white/10 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
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
