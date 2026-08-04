import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import {
  useIsAdmin,
  useIsAerogapEmployee,
  useIsLogbookEnabled,
  useIsFeatureEnabled,
  useMyAdminCompanies,
  useUserSettings,
  useIsQualityCommandHubAvailable,
} from '../hooks/useConvexData';
import { toast } from 'sonner';
import { FEATURE_KEYS } from '../config/featureKeys';
import {
  DEFAULT_OPEN_GROUPS,
  FEATURE_GATED_ROUTES,
  getNavGroups,
  groupIdForPath,
  type NavFlags,
  type NavGroupId,
} from '../config/navConfig';
import {
  FiUsers,
  FiSettings,
  FiBriefcase,
  FiLogOut,
  FiShield,
  FiX,
  FiChevronDown,
  FiHelpCircle,
  FiHome,
} from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';
import { useReadinessSummary } from '../hooks/useReadinessSummary';
import { useAppSignOut } from '../hooks/useAppSignOut';
import { NavAttentionDot, NavSectionActivityDot } from './ReadinessDot';
import ReadinessLegend from './readiness/ReadinessLegend';
import { CompanyProjectSwitcher } from './CompanyProjectSwitcher';

/**
 * Tell the user why they were bounced to Home instead of silently redirecting.
 * Stable toast id so effect re-runs don't stack duplicates.
 */
function toastFeatureDisabled(featureLabel: string) {
  toast.info(
    `${featureLabel} isn't enabled for your account. Ask your administrator to enable it.`,
    { id: 'feature-redirect' },
  );
}

const NAV_GROUPS_OPEN_STORAGE_KEY = 'aerogap_nav_groups_open';

type OpenGroups = Record<NavGroupId, boolean>;

function loadOpenGroups(): OpenGroups {
  try {
    const raw = localStorage.getItem(NAV_GROUPS_OPEN_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPEN_GROUPS };
    const parsed = JSON.parse(raw) as Partial<OpenGroups>;
    return {
      audit: parsed.audit === true,
      documents: parsed.documents === true,
      operations: parsed.operations === true,
      tools: parsed.tools === true,
    };
  } catch {
    return { ...DEFAULT_OPEN_GROUPS };
  }
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
  const myAdminCompanies = useMyAdminCompanies();
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
  const isAnalyticsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ANALYTICS);
  const isEntityIssuesEnabled = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isRevisionsEnabled = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isDctComplianceEnabled = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const isScheduleEnabled = useIsFeatureEnabled(FEATURE_KEYS.SCHEDULE);
  const isQualityCommandCenterEnabled = useIsQualityCommandHubAvailable();
  const { user } = useUser();
  const signOutWithCleanup = useAppSignOut();

  const [openGroups, setOpenGroups] = useState<OpenGroups>(() => loadOpenGroups());

  // Track the md breakpoint so the nav tree (CompanyProjectSwitcher and its
  // Convex subscriptions + auto-select settings writes) mounts exactly once —
  // CSS `hidden md:flex` alone keeps BOTH copies mounted and querying.
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggleGroup = (id: NavGroupId) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const navFlags: NavFlags = useMemo(
    () => ({
      guidedAudit: Boolean(isGuidedAuditEnabled),
      checklists: Boolean(isChecklistsEnabled),
      paperworkReview: Boolean(isPaperworkReviewEnabled),
      auditSimulation: Boolean(isAuditSimEnabled),
      entityIssues: Boolean(isEntityIssuesEnabled),
      reportBuilder: Boolean(isReportBuilderEnabled),
      library: Boolean(isLibraryEnabled),
      revisions: Boolean(isRevisionsEnabled),
      manualManagement: Boolean(isManualManagementEnabled),
      schedule: Boolean(isScheduleEnabled),
      qualityHub: Boolean(isQualityCommandCenterEnabled),
      dctCompliance: Boolean(isDctComplianceEnabled),
      manualWriter: Boolean(isManualWriterEnabled),
      form337: Boolean(isForm337Enabled),
      analysis: Boolean(isAnalysisEnabled),
      analytics: Boolean(isAnalyticsEnabled),
      logbookEnabled: Boolean(isLogbookEnabled),
      aerogapEmployee: Boolean(isAerogapEmployee),
      isAdmin: Boolean(isAdmin),
    }),
    [
      isGuidedAuditEnabled,
      isChecklistsEnabled,
      isPaperworkReviewEnabled,
      isAuditSimEnabled,
      isEntityIssuesEnabled,
      isReportBuilderEnabled,
      isLibraryEnabled,
      isRevisionsEnabled,
      isManualManagementEnabled,
      isScheduleEnabled,
      isQualityCommandCenterEnabled,
      isDctComplianceEnabled,
      isManualWriterEnabled,
      isForm337Enabled,
      isAnalysisEnabled,
      isAnalyticsEnabled,
      isLogbookEnabled,
      isAerogapEmployee,
      isAdmin,
    ],
  );

  const navGroups = useMemo(() => getNavGroups(navFlags), [navFlags]);

  // Deep links / search: reveal the group that owns the current route. Adjusted
  // during render so the owning group is already open on the first paint after a
  // navigation, rather than snapping open a frame later.
  const routeGroupKey = `${location.pathname}:${isLogbookEnabled}`;
  const [prevRouteGroupKey, setPrevRouteGroupKey] = useState(routeGroupKey);
  if (prevRouteGroupKey !== routeGroupKey) {
    setPrevRouteGroupKey(routeGroupKey);
    const activeGroup = groupIdForPath(location.pathname, isLogbookEnabled);
    if (activeGroup) {
      setOpenGroups((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
    }
  }

  // Persisting here rather than inside each updater: writing localStorage from a
  // state updater (or from render) is a side effect in a place that has to stay
  // pure. One effect covers both the toggle and the route-driven reveal.
  useEffect(() => {
    localStorage.setItem(NAV_GROUPS_OPEN_STORAGE_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    if (isLogbookEnabled) return;
    // Full logbook management requires entitlement; Entry Review stays reachable at /logbook/entry-review.
    if (location.pathname === '/logbook') {
      toastFeatureDisabled('Logbook');
      navigate('/splash');
    }
  }, [isLogbookEnabled, location.pathname, navigate]);

  // Auto-redirect when feature-gated routes become disabled for this user
  useEffect(() => {
    const flagByKey: Record<string, boolean> = {
      [FEATURE_KEYS.MANUAL_WRITER]: isManualWriterEnabled,
      [FEATURE_KEYS.MANUAL_MANAGEMENT]: isManualManagementEnabled,
      [FEATURE_KEYS.FORM_337]: isForm337Enabled,
      [FEATURE_KEYS.DCT_COMPLIANCE]: isDctComplianceEnabled,
      [FEATURE_KEYS.LIBRARY]: isLibraryEnabled,
      [FEATURE_KEYS.GUIDED_AUDIT]: isGuidedAuditEnabled,
      [FEATURE_KEYS.CHECKLISTS]: isChecklistsEnabled,
      [FEATURE_KEYS.PAPERWORK_REVIEW]: isPaperworkReviewEnabled,
      [FEATURE_KEYS.AUDIT_SIMULATION]: isAuditSimEnabled,
      [FEATURE_KEYS.ENTITY_ISSUES]: isEntityIssuesEnabled,
      [FEATURE_KEYS.REPORT_BUILDER]: isReportBuilderEnabled,
      [FEATURE_KEYS.REVISIONS]: isRevisionsEnabled,
      [FEATURE_KEYS.SCHEDULE]: isScheduleEnabled,
      [FEATURE_KEYS.ANALYTICS]: isAnalyticsEnabled,
      [FEATURE_KEYS.ANALYSIS]: isAnalysisEnabled,
    };
    for (const gate of FEATURE_GATED_ROUTES) {
      if (!gate.paths.has(location.pathname)) continue;
      if (flagByKey[gate.featureKey]) continue;
      toastFeatureDisabled(gate.label);
      navigate('/splash');
      return;
    }
    if (!isQualityCommandCenterEnabled && location.pathname === '/quality-command-center') {
      toastFeatureDisabled('Quality & Compliance');
      navigate('/splash');
    }
  }, [
    isManualWriterEnabled,
    isManualManagementEnabled,
    isForm337Enabled,
    isDctComplianceEnabled,
    isLibraryEnabled,
    isGuidedAuditEnabled,
    isChecklistsEnabled,
    isPaperworkReviewEnabled,
    isAuditSimEnabled,
    isEntityIssuesEnabled,
    isReportBuilderEnabled,
    isRevisionsEnabled,
    isScheduleEnabled,
    isAnalyticsEnabled,
    isAnalysisEnabled,
    isQualityCommandCenterEnabled,
    isAerogapEmployee,
    location.pathname,
    navigate,
  ]);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  const sharedItems = [
    { path: '/splash', label: 'Home', icon: FiHome },
    { path: '/help', label: 'Help', icon: FiHelpCircle },
    { path: '/settings', label: 'Settings', icon: FiSettings },
  ];
  const sidebarShellClass = isDarkMode
    ? 'bg-navy-900 border-white/10'
    : 'bg-white/88 border-slate-200/90 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] backdrop-blur-md';
  const sidebarTitleClass = isDarkMode
    ? 'bg-gradient-to-r from-white to-sky-lighter'
    : 'bg-gradient-to-r from-slate-900 via-slate-800 to-sky-700';
  const sidebarTaglineClass = isDarkMode ? 'text-sky-lighter/70' : 'text-slate-500';
  const menuDividerClass = isDarkMode ? 'border-white/[0.06]' : 'border-slate-200';
  const userSectionBorderClass = isDarkMode ? 'border-white/10' : 'border-slate-200';
  const userNameClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const userEmailClass = isDarkMode ? 'text-white/70' : 'text-slate-500';
  const signOutClass = isDarkMode ? 'text-white/60 hover:text-white/60' : 'text-slate-500 hover:text-slate-700';
  const navItemBaseClass = 'w-full flex items-center gap-3 px-3 h-9 rounded-lg mb-1 transition-all text-sm';
  const navIconClass = 'text-[15px] flex-shrink-0';

  const activeLinkClass = isDarkMode
    ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
    : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200';
  const inactiveLinkClass = isDarkMode
    ? 'text-white/60 hover:text-white hover:bg-white/5'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  const groupButtonIdleClass = isDarkMode
    ? 'text-white/80 hover:text-white hover:bg-white/5'
    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100';

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
        {navGroups.length > 0 && (
          <div className="flex items-center justify-between px-3 pt-1">
            <span className={`text-[10px] uppercase tracking-wide ${isDarkMode ? 'text-white/35' : 'text-slate-400'}`}>
              Status dots
            </span>
            <ReadinessLegend isDarkMode={isDarkMode} />
          </div>
        )}
        {navGroups.map((group) => {
          const isOpen = openGroups[group.id];
          const GroupIcon = group.icon;
          const groupIsActive = group.items.some((item) => item.path === location.pathname);
          const collapsedAttention = !isOpen
            ? group.items.map((item) => navDotProps(item.path)).find(Boolean)
            : null;
          const guidedFirst = group.showWorkflowHints && group.items[0]?.path === '/guided-audit';

          return (
            <div key={group.id} className="mb-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                className={`${navItemBaseClass} justify-between ${
                  groupIsActive && !isOpen ? activeLinkClass : groupButtonIdleClass
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <GroupIcon className={navIconClass} />
                  <span className="font-semibold truncate">{group.label}</span>
                  {collapsedAttention && (
                    <NavAttentionDot
                      level={collapsedAttention.level}
                      isDarkMode={isDarkMode}
                      title={collapsedAttention.title}
                    />
                  )}
                </span>
                <FiChevronDown
                  className={`text-sm flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className={`ml-3 pl-2 border-l ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                  {group.items.map((item, idx) => {
                    const Icon = item.icon;
                    const attention = navDotProps(item.path);
                    const activity = navActivityDotProps(item.path);
                    const isGuidedEntry = guidedFirst && idx === 0;
                    const stepNumber = guidedFirst ? idx : idx + 1;

                    if (group.showWorkflowHints) {
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => onNavigate?.()}
                          title={item.hint ? `${item.label} — ${item.hint}` : item.label}
                          className={({ isActive }) =>
                            `w-full flex items-start gap-3 px-3 py-1.5 rounded-lg mb-1 transition-all text-sm ${
                              isActive ? activeLinkClass : inactiveLinkClass
                            }`
                          }
                        >
                          <Icon className={`${navIconClass} mt-0.5`} />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium flex items-center gap-2 min-w-0">
                              <span className="truncate">{item.label}</span>
                              {isGuidedEntry && (
                                <span
                                  className={`flex-shrink-0 px-1.5 py-px rounded-full text-[10px] font-semibold ${
                                    isDarkMode
                                      ? 'bg-sky/25 text-sky-lighter border border-sky-light/30'
                                      : 'bg-sky-100 text-sky-700 border border-sky-200'
                                  }`}
                                >
                                  Start here
                                </span>
                              )}
                              {attention ? (
                                <NavAttentionDot level={attention.level} isDarkMode={isDarkMode} title={attention.title} />
                              ) : activity ? (
                                <NavSectionActivityDot isDarkMode={isDarkMode} title={activity.title} />
                              ) : null}
                            </span>
                            {item.hint && (
                              <span className={`block text-[11px] truncate ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
                                {isGuidedEntry ? item.hint : `${stepNumber}. ${item.hint}`}
                              </span>
                            )}
                          </span>
                        </NavLink>
                      );
                    }

                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/' || item.end}
                        onClick={() => onNavigate?.()}
                        title={item.hint ? `${item.label} — ${item.hint}` : item.label}
                        className={({ isActive }) =>
                          `${navItemBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
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
              )}
            </div>
          );
        })}

        {navGroups.length > 0 && (
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
                `${navItemBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
              }
            >
              <Icon className={navIconClass} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {myAdminCompanies && myAdminCompanies.length > 0 && (
          <NavLink
            to="/company-admin"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `${navItemBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
            }
          >
            <FiBriefcase className={navIconClass} />
            <span className="font-medium">Company Admin</span>
          </NavLink>
        )}

        {isAerogapEmployee && (
          <NavLink
            to="/companies"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `${navItemBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
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
              `${navItemBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
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
              `${navItemBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
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
              onClick={async () => {
                await signOutWithCleanup();
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
        {isDesktop ? sidebarContent : null}
      </aside>

      {/* Mobile Drawer Sidebar — use `hidden` when closed so no full-screen layer stays in the hit-test stack (avoids sporadic “dead clicks” on some browsers).
          Content mounts only while open: the same tree is already mounted in the
          desktop aside, and mounting it twice doubles every Convex subscription
          (and CompanyProjectSwitcher's auto-select settings writes). */}
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
          {mobileOpen ? sidebarContent : null}
        </aside>
      </div>
    </>
  );
}
