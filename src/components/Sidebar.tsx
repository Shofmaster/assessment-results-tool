import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import {
  useIsAdmin,
  useIsAerogapEmployee,
  useIsLogbookEnabled,
  useIsFeatureEnabled,
  useUserSettings,
  useIsQualityCommandHubAvailable,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import {
  FiFolder,
  FiFileText,
  FiUsers,
  FiSettings,
  FiBriefcase,
  FiRefreshCw,
  FiLogOut,
  FiShield,
  FiX,
  FiCheckSquare,
  FiList,
  FiAlertTriangle,
  FiBookOpen,
  FiDatabase,
  FiHelpCircle,
  FiHome,
  FiGrid,
  FiClipboard,
  FiLayers,
} from 'react-icons/fi';
import { Select } from './ui';
import { useTheme } from '../context/ThemeContext';
import { useReadinessSummary } from '../hooks/useReadinessSummary';
import { NavAttentionDot, NavSectionActivityDot } from './ReadinessDot';
import { CompanyProjectSwitcher } from './CompanyProjectSwitcher';

type Section = 'home' | 'compliance' | 'manual-writer' | 'manual-management' | 'logbook' | 'form-337';

const SECTION_STORAGE_KEY = 'aerogap_section';

const MANUAL_WRITER_ROUTES = new Set(['/manual-writer', '/aerogap-dashboard']);
const MANUAL_MANAGEMENT_ROUTES = new Set(['/manual-management']);
const LOGBOOK_ROUTES = new Set(['/logbook', '/logbook/entry-review']);
const FORM_337_ROUTES = new Set(['/form-337']);
const COMPLIANCE_ROUTES = new Set([
  '/', '/quality-command-center', '/compliance-dashboard', '/guided-audit', '/library', '/analysis', '/audit',
  '/review', '/entity-issues', '/roster', '/revisions', '/analytics', '/report', '/checklists', '/dct-compliance',
]);

/** First Compliance destination when switching sections — QM hub when enabled, else evidence-first. */
function getComplianceLandingPath(flags: {
  isQualityCommandCenterEnabled: boolean;
  isLibraryEnabled: boolean;
  isPaperworkReviewEnabled: boolean;
  isRevisionsEnabled: boolean;
  isEntityIssuesEnabled: boolean;
  isChecklistsEnabled: boolean;
  isAnalysisEnabled: boolean;
  isGuidedAuditEnabled: boolean;
  isAuditSimEnabled: boolean;
  isReportBuilderEnabled: boolean;
  isAnalyticsEnabled: boolean;
  isDctComplianceEnabled: boolean;
}): string {
  if (flags.isQualityCommandCenterEnabled) return '/quality-command-center';
  if (flags.isLibraryEnabled) return '/library';
  if (flags.isPaperworkReviewEnabled) return '/review';
  if (flags.isDctComplianceEnabled) return '/dct-compliance';
  if (flags.isRevisionsEnabled) return '/revisions';
  if (flags.isEntityIssuesEnabled) return '/roster';
  if (flags.isChecklistsEnabled) return '/checklists';
  if (flags.isAnalysisEnabled) return '/analysis';
  if (flags.isGuidedAuditEnabled) return '/guided-audit';
  if (flags.isAuditSimEnabled) return '/audit';
  if (flags.isReportBuilderEnabled) return '/report';
  if (flags.isAnalyticsEnabled) return '/analytics';
  return '/splash';
}

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onNavigate?: () => void;
};

export default function Sidebar({ mobileOpen = false, onMobileClose, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const isAdmin = useIsAdmin();
  const isAerogapEmployee = useIsAerogapEmployee();
  const isLogbookEnabled = useIsLogbookEnabled();
  const userSettings = useUserSettings();
  const activeCompanyIdFromSettings = userSettings?.activeCompanyId as string | undefined;
  const { scopeLevel, navDotProps, navActivityDotProps } = useReadinessSummary({
    isAerogapEmployee,
    activeCompanyId: activeCompanyIdFromSettings,
  });

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
  const isAnalyticsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ANALYTICS);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isDctComplianceEnabled = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const isQualityCommandCenterEnabled = useIsQualityCommandHubAvailable();
  const { user } = useUser();
  const { signOut } = useClerk();

  const getInitialSection = (): Section => {
    if (location.pathname === '/splash') return 'home';
    if (isManualWriterEnabled && MANUAL_WRITER_ROUTES.has(location.pathname)) return 'manual-writer';
    if (isManualManagementEnabled && MANUAL_MANAGEMENT_ROUTES.has(location.pathname)) return 'manual-management';
    if (isForm337Enabled && FORM_337_ROUTES.has(location.pathname)) return 'form-337';
    if (isLogbookEnabled && LOGBOOK_ROUTES.has(location.pathname)) return 'logbook';
    if (COMPLIANCE_ROUTES.has(location.pathname)) return 'compliance';
    const stored = localStorage.getItem(SECTION_STORAGE_KEY);
    if (stored === 'home') return stored;
    if (stored === 'compliance') return stored;
    if (stored === 'audit') return 'compliance';
    if (stored === 'manual-writer' && isManualWriterEnabled) return stored;
    if (stored === 'manual-management' && isManualManagementEnabled) return stored;
    if (stored === 'logbook' && isLogbookEnabled) return stored;
    if (stored === 'form-337' && isForm337Enabled) return stored;
    return 'home';
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
      'home': '/splash',
      'compliance': getComplianceLandingPath({
        isQualityCommandCenterEnabled,
        isLibraryEnabled,
        isPaperworkReviewEnabled,
        isDctComplianceEnabled,
        isRevisionsEnabled,
        isEntityIssuesEnabled,
        isChecklistsEnabled,
        isAnalysisEnabled,
        isGuidedAuditEnabled,
        isAuditSimEnabled,
        isReportBuilderEnabled,
        isAnalyticsEnabled,
      }),
      'manual-writer': '/manual-writer',
      'manual-management': '/manual-management',
      'logbook': '/logbook',
      'form-337': '/form-337',
    };
    navigate(destinations[target]);
    onNavigate?.();
  };

  // Sync section state when URL changes to a section-specific route
  useEffect(() => {
    if (location.pathname === '/splash') {
      setSection('home');
      localStorage.setItem(SECTION_STORAGE_KEY, 'home');
    } else if (isManualWriterEnabled && MANUAL_WRITER_ROUTES.has(location.pathname)) {
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
    } else if (COMPLIANCE_ROUTES.has(location.pathname)) {
      setSection('compliance');
      localStorage.setItem(SECTION_STORAGE_KEY, 'compliance');
    }
  }, [isLogbookEnabled, isManualWriterEnabled, isManualManagementEnabled, isForm337Enabled, location.pathname]);

  useEffect(() => {
    if (isLogbookEnabled) return;
    if (section === 'logbook') {
      setSection('home');
      localStorage.setItem(SECTION_STORAGE_KEY, 'home');
    }
    if (LOGBOOK_ROUTES.has(location.pathname)) {
      navigate('/splash');
    }
  }, [isLogbookEnabled, location.pathname, navigate, section]);

  // Auto-redirect when feature-gated sections become disabled for this user
  useEffect(() => {
    if (!isManualWriterEnabled) {
      if (section === 'manual-writer') {
        setSection('home');
        localStorage.setItem(SECTION_STORAGE_KEY, 'home');
      }
      if (MANUAL_WRITER_ROUTES.has(location.pathname) && location.pathname !== '/aerogap-dashboard') {
        navigate('/splash');
      }
    }
    if (!isManualManagementEnabled) {
      if (section === 'manual-management') {
        setSection('home');
        localStorage.setItem(SECTION_STORAGE_KEY, 'home');
      }
      if (MANUAL_MANAGEMENT_ROUTES.has(location.pathname)) {
        navigate('/splash');
      }
    }
    if (!isForm337Enabled) {
      if (section === 'form-337') {
        setSection('home');
        localStorage.setItem(SECTION_STORAGE_KEY, 'home');
      }
      if (FORM_337_ROUTES.has(location.pathname)) {
        navigate('/splash');
      }
    }
  }, [isManualWriterEnabled, isManualManagementEnabled, isForm337Enabled, location.pathname, navigate, section]);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  const complianceCommandCenterItems = [
    ...(isQualityCommandCenterEnabled
      ? [{ path: '/quality-command-center', label: 'Quality & Compliance', icon: FiGrid }]
      : []),
  ];
  const compliancePlanningItems = [
    ...(isChecklistsEnabled ? [{ path: '/checklists', label: 'Checklists', icon: FiCheckSquare }] : []),
    ...(isGuidedAuditEnabled ? [{ path: '/guided-audit', label: 'Guided Audit', icon: FiList }] : []),
  ];
  const compliancePeopleItems = [
    ...(isEntityIssuesEnabled ? [{ path: '/roster', label: 'Roster', icon: FiUsers }] : []),
  ];
  const complianceEvidenceItems = [
    ...(isLibraryEnabled ? [{ path: '/library', label: 'Library', icon: FiFolder }] : []),
    ...(isPaperworkReviewEnabled ? [{ path: '/review', label: 'Paperwork Review', icon: FiCheckSquare }] : []),
    ...(isDctComplianceEnabled ? [{ path: '/dct-compliance', label: 'DCT Compliance', icon: FiLayers }] : []),
    ...(isRevisionsEnabled ? [{ path: '/revisions', label: 'Revisions', icon: FiRefreshCw }] : []),
  ];
  const complianceAssessmentItems = [
    ...(isAnalysisEnabled ? [{ path: '/analysis', label: 'Analysis', icon: FiFileText }] : []),
    ...(isEntityIssuesEnabled ? [{ path: '/entity-issues', label: 'CARs & Issues', icon: FiAlertTriangle }] : []),
    ...(isAuditSimEnabled ? [{ path: '/audit', label: 'Audit Simulation', icon: FiUsers }] : []),
  ];
  const complianceReportingItems = [
    ...(isReportBuilderEnabled ? [{ path: '/report', label: 'Report Builder', icon: FiBookOpen }] : []),
  ];
  const complianceGroups = [
    ...(complianceCommandCenterItems.length
      ? [{ label: 'Command Center', items: complianceCommandCenterItems }]
      : []),
    { label: 'Evidence', items: complianceEvidenceItems },
    { label: 'People', items: compliancePeopleItems },
    { label: 'Planning', items: compliancePlanningItems },
    { label: 'Assessment', items: complianceAssessmentItems },
    { label: 'Reporting', items: complianceReportingItems },
  ].filter((group) => group.items.length > 0);

  const logbookItems = [
    { path: '/logbook', label: 'Logbook', icon: FiDatabase, end: true },
    { path: '/logbook/entry-review', label: 'Entry Review', icon: FiClipboard, end: true },
  ];
  // Manual Writer / Manuals use the section dropdown only — no cross-links here.
  const manualWriterItems: typeof logbookItems = [];
  const manualManagementItems: typeof logbookItems = [];

  const sharedItems = [
    { path: '/splash', label: 'Home', icon: FiHome },
    { path: '/help', label: 'Help', icon: FiHelpCircle },
    { path: '/settings', label: 'Settings', icon: FiSettings },
  ];

  const sectionItemsMap: Record<Section, typeof logbookItems> = {
    'home': [],
    'compliance': [],
    'manual-writer': manualWriterItems,
    'manual-management': manualManagementItems,
    'logbook': logbookItems,
    // The section switcher already routes to /form-337; no extra module link needed.
    'form-337': [],
  };
  const sectionOptions: Array<{ key: Section; label: string }> = [
    { key: 'home', label: 'Home' },
    { key: 'compliance', label: 'Compliance' },
    ...(isManualWriterEnabled     ? [{ key: 'manual-writer',     label: 'Manual Writer'  } as const] : []),
    ...(isManualManagementEnabled ? [{ key: 'manual-management', label: 'Manuals'        } as const] : []),
    ...(isLogbookEnabled          ? [{ key: 'logbook',           label: 'Logbook'        } as const] : []),
    ...(isForm337Enabled          ? [{ key: 'form-337',          label: 'FAA Form 337'   } as const] : []),
  ];
  const activeSectionItems = sectionItemsMap[section];
  const sectionSpecificItems = activeSectionItems;
  const sectionSpecificGroups = section === 'compliance' ? complianceGroups : [];
  const sidebarShellClass = isDarkMode
    ? 'bg-navy-900 border-white/10'
    : 'bg-white/88 border-slate-200/90 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] backdrop-blur-md';
  const sidebarTitleClass = isDarkMode
    ? 'bg-gradient-to-r from-white to-sky-lighter'
    : 'bg-gradient-to-r from-slate-900 via-slate-800 to-sky-700';
  const sidebarTaglineClass = isDarkMode ? 'text-sky-lighter/70' : 'text-slate-500';
  const controlSurfaceClass = isDarkMode
    ? 'bg-white/[0.04] border-white/[0.10] text-white/90'
    : 'bg-slate-100/90 border-slate-300/80 text-slate-800';
  const menuDividerClass = isDarkMode ? 'border-white/[0.06]' : 'border-slate-200';
  const userSectionBorderClass = isDarkMode ? 'border-white/10' : 'border-slate-200';
  const userNameClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const userEmailClass = isDarkMode ? 'text-white/70' : 'text-slate-500';
  const signOutClass = isDarkMode ? 'text-white/60 hover:text-white/60' : 'text-slate-500 hover:text-slate-700';
  const navItemBaseClass = 'w-full flex items-center gap-3 px-3 h-9 rounded-lg mb-1 transition-all text-sm';
  const navIconClass = 'text-[15px] flex-shrink-0';
  const sectionHeadingClass = isDarkMode ? 'text-white/50' : 'text-slate-500';

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden">
      <div className="p-4 pb-2 flex items-start justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            navigate('/splash');
            onNavigate?.();
          }}
          className={`text-left rounded-lg -m-1 p-1 min-w-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-light/40 ${
            isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100/80'
          }`}
          aria-label="Go to home"
        >
          <h1 className={`text-2xl font-display font-bold bg-clip-text text-transparent ${sidebarTitleClass}`}>
            AeroGap
          </h1>
          <p className={`text-sm mt-1 ${sidebarTaglineClass}`}>Assistive Intelligence</p>
        </button>
        <button
          type="button"
          onClick={() => onMobileClose?.()}
          className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close menu"
        >
          <FiX className="text-base" />
        </button>
      </div>

      {/* Section Switcher */}
      <div className="px-3 mb-2 shrink-0">
        <Select
          aria-label="Select section"
          value={section}
          onChange={(e) => switchSection(e.target.value as Section)}
          selectSize="sm"
          className={controlSurfaceClass}
        >
          {sectionOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <CompanyProjectSwitcher
        isDarkMode={isDarkMode}
        mobileOpen={mobileOpen}
        onNavigate={onNavigate}
        scopeLevel={scopeLevel}
      />

      <nav
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 space-y-0"
        aria-label="Main navigation"
        style={{ scrollbarGutter: 'stable' }}
      >
        {sectionSpecificGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className={`px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide font-semibold ${sectionHeadingClass}`}>
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const attention = navDotProps(item.path);
              const activity = navActivityDotProps(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => onNavigate?.()}
                  title={item.label}
                  className={({ isActive }) =>
                    `${navItemBaseClass} ${
                      isActive
                        ? (isDarkMode
                          ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                          : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                        : (isDarkMode
                          ? 'text-white/60 hover:text-white hover:bg-white/5'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                    }`
                  }
                >
                  <Icon className={navIconClass} />
                  <span className="font-medium flex items-center gap-2 min-w-0">
                    <span className="truncate">{item.label}</span>
                    {attention ? (
                      <NavAttentionDot level={attention.level} isDarkMode={isDarkMode} title={attention.title} />
                    ) : activity ? (
                      <NavSectionActivityDot isDarkMode={isDarkMode} title={activity.title} />
                    ) : null}
                  </span>
                </NavLink>
              );
            })}
          </div>
        ))}

        {sectionSpecificItems.map((item) => {
          const Icon = item.icon;
          const attention = navDotProps(item.path);
          const activity = navActivityDotProps(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/' || item.end}
              onClick={() => onNavigate?.()}
              title={item.label}
              className={({ isActive }) =>
                `${navItemBaseClass} ${
                  isActive
                    ? (isDarkMode
                      ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                      : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                    : (isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                }`
              }
            >
              <Icon className={navIconClass} />
              <span className="font-medium flex items-center gap-2 min-w-0">
                <span className="truncate">{item.label}</span>
                {attention ? (
                  <NavAttentionDot level={attention.level} isDarkMode={isDarkMode} title={attention.title} />
                ) : activity ? (
                  <NavSectionActivityDot isDarkMode={isDarkMode} title={activity.title} />
                ) : null}
              </span>
            </NavLink>
          );
        })}

        {(sectionSpecificItems.length > 0 || sectionSpecificGroups.length > 0) && (
          <div className={`border-t my-2 ${menuDividerClass}`} />
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
                `${navItemBaseClass} ${
                  isActive
                    ? (isDarkMode
                      ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                      : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                    : (isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                }`
              }
            >
              <Icon className={navIconClass} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {isAerogapEmployee && (
          <NavLink
            to="/companies"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `${navItemBaseClass} ${
                isActive
                  ? (isDarkMode
                    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                    : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                  : (isDarkMode
                    ? 'text-white/60 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
              }`
            }
          >
            <FiBriefcase className={navIconClass} />
            <span className="font-medium">Companies</span>
          </NavLink>
        )}
        {isAerogapEmployee && (
          <NavLink
            to="/aerogap-dashboard"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `${navItemBaseClass} ${
                isActive
                  ? (isDarkMode
                    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                    : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                  : (isDarkMode
                    ? 'text-white/60 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
              }`
            }
          >
            <FiUsers className={navIconClass} />
            <span className="font-medium">Employee Dashboard</span>
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `${navItemBaseClass} ${
                isActive
                  ? (isDarkMode
                    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                    : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                  : (isDarkMode
                    ? 'text-white/60 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
              }`
            }
          >
            <FiShield className={navIconClass} />
            <span className="font-medium">Admin</span>
          </NavLink>
        )}
      </nav>

      <div className={`p-4 border-t shrink-0 ${userSectionBorderClass}`}>
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
              <div className={`text-sm font-medium truncate ${userNameClass}`}>{user.fullName || user.primaryEmailAddress?.emailAddress}</div>
              <div className={`text-xs truncate ${userEmailClass}`}>
                {user.primaryEmailAddress?.emailAddress}
              </div>
            </div>
            <button
              onClick={() => {
                signOut();
                onNavigate?.();
              }}
              title="Sign Out"
              className={`transition-colors flex-shrink-0 ${signOutClass}`}
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
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex w-52 lg:w-64 shrink-0 h-full min-h-0 border-r flex-col overflow-x-hidden ${sidebarShellClass}`}>
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar — use `hidden` when closed so no full-screen layer stays in the hit-test stack (avoids sporadic “dead clicks” on some browsers). */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition ${mobileOpen ? 'pointer-events-auto' : 'hidden'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => onMobileClose?.()}
        />
        <aside
          id="mobile-sidebar"
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r flex flex-col h-full min-h-0 overflow-x-hidden transform transition-transform duration-200 ease-out ${sidebarShellClass} ${
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
