import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
import { FEATURE_KEYS, FEATURE_LABELS } from '../config/featureKeys';
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
  FiChevronDown,
  FiList,
  FiAlertTriangle,
  FiBookOpen,

  FiHelpCircle,
  FiHome,
  FiGrid,
  FiClipboard,
  FiLayers,
  FiCalendar,
  FiEdit3,
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

const AUDIT_PREP_OPEN_STORAGE_KEY = 'aerogap_audit_prep_open';

/** All audit tooling lives in one workflow-ordered dropdown; these routes auto-expand it. */
const AUDIT_PREP_ROUTES = new Set(['/guided-audit', '/checklists', '/review', '/audit', '/entity-issues', '/report']);

type NavItem = { path: string; label: string; icon: IconType; hint?: string; end?: boolean };
type NavGroup = { label: string; items: NavItem[]; kind?: 'audit' };

// Routes gated behind per-user feature flags — used by the disabled-feature redirect effects.
const MANUAL_WRITER_ROUTES = new Set(['/manual-writer', '/aerogap-dashboard']);
const MANUAL_MANAGEMENT_ROUTES = new Set(['/manual-management']);
const FORM_337_ROUTES = new Set(['/form-337']);

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
  const isEntityIssuesEnabled = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isRevisionsEnabled = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isDctComplianceEnabled = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const isScheduleEnabled = useIsFeatureEnabled(FEATURE_KEYS.SCHEDULE);
  const isQualityCommandCenterEnabled = useIsQualityCommandHubAvailable();
  const { user } = useUser();
  const signOutWithCleanup = useAppSignOut();

  const [auditPrepOpen, setAuditPrepOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(AUDIT_PREP_OPEN_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const toggleAuditPrep = () => {
    setAuditPrepOpen((open) => {
      localStorage.setItem(AUDIT_PREP_OPEN_STORAGE_KEY, String(!open));
      return !open;
    });
  };

  // Navigating to any audit tool (e.g. via search or a deep link) reveals the group.
  useEffect(() => {
    if (AUDIT_PREP_ROUTES.has(location.pathname)) setAuditPrepOpen(true);
  }, [location.pathname]);

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
    if (!isManualWriterEnabled && MANUAL_WRITER_ROUTES.has(location.pathname) && location.pathname !== '/aerogap-dashboard') {
      toastFeatureDisabled(FEATURE_LABELS['manual-writer']);
      navigate('/splash');
    }
    if (!isManualManagementEnabled && MANUAL_MANAGEMENT_ROUTES.has(location.pathname)) {
      toastFeatureDisabled(FEATURE_LABELS['manual-management']);
      navigate('/splash');
    }
    if (!isForm337Enabled && FORM_337_ROUTES.has(location.pathname)) {
      toastFeatureDisabled(FEATURE_LABELS['form-337']);
      navigate('/splash');
    }
  }, [isManualWriterEnabled, isManualManagementEnabled, isForm337Enabled, location.pathname, navigate]);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  const complianceCommandCenterItems: NavItem[] = [
    ...(isQualityCommandCenterEnabled
      ? [{ path: '/quality-command-center', label: 'Quality & Compliance', icon: FiGrid }]
      : []),
  ];
  // Everything you touch when getting ready for an audit, in the order you'd use it.
  const auditPrepItems: NavItem[] = [
    ...(isGuidedAuditEnabled
      ? [{ path: '/guided-audit', label: 'Guided Audit', icon: FiList, hint: 'Everything in one flow' }]
      : []),
    ...(isChecklistsEnabled
      ? [{ path: '/checklists', label: 'Checklists', icon: FiCheckSquare, hint: 'Prep what auditors ask for' }]
      : []),
    ...(isPaperworkReviewEnabled
      ? [{ path: '/review', label: 'Paperwork Review', icon: FiFileText, hint: 'Check docs vs. references' }]
      : []),
    ...(isAuditSimEnabled
      ? [{ path: '/audit', label: 'Audit Simulation', icon: FiUsers, hint: 'Practice with AI auditors' }]
      : []),
    ...(isEntityIssuesEnabled
      ? [{ path: '/entity-issues', label: 'CARs & Issues', icon: FiAlertTriangle, hint: 'Fix findings before the audit' }]
      : []),
    ...(isReportBuilderEnabled
      ? [{ path: '/report', label: 'Report Builder', icon: FiBookOpen, hint: 'Assemble the final report' }]
      : []),
  ];
  const compliancePlanningItems: NavItem[] = [
    ...(isScheduleEnabled ? [{ path: '/schedule', label: 'Recurring Schedule', icon: FiCalendar }] : []),
    ...(isScheduleEnabled
      ? [{ path: '/compliance-report', label: 'Compliance Report', icon: FiFileText, hint: 'Schedule vs. logbook status' }]
      : []),
  ];
  const compliancePeopleItems: NavItem[] = [
    ...(isEntityIssuesEnabled ? [{ path: '/roster', label: 'Roster', icon: FiUsers }] : []),
  ];
  const complianceEvidenceItems: NavItem[] = [
    ...(!isLogbookEnabled ? [{ path: '/logbook/entry-review', label: 'Entry Review', icon: FiClipboard }] : []),
    ...(isLibraryEnabled ? [{ path: '/library', label: 'Library', icon: FiFolder }] : []),
    ...(isRevisionsEnabled ? [{ path: '/revisions', label: 'Revisions', icon: FiRefreshCw }] : []),
  ];
  const complianceAssessmentItems: NavItem[] = [
    ...(isAnalysisEnabled && isAerogapEmployee
      ? [{ path: '/analysis', label: 'Analysis', icon: FiFileText }]
      : []),
  ];
  const logbookItems: NavItem[] = [
    { path: '/logbook/entry-review', label: 'Entry Review', icon: FiClipboard, end: true },
    { path: '/fleet', label: 'Fleet & Discrepancies', icon: FiAlertTriangle, end: true },
  ];
  // Feature-gated tool modules — previously hidden behind the section dropdown.
  const moduleItems: NavItem[] = [
    ...(isDctComplianceEnabled
      ? [{ path: '/dct-compliance', label: 'DCT Compliance', icon: FiLayers, hint: 'FAA SAS traceability', end: true }]
      : []),
    ...(isManualWriterEnabled
      ? [{ path: '/manual-writer', label: 'Manual Writer', icon: FiEdit3 }]
      : []),
    ...(isManualManagementEnabled
      ? [{ path: '/manual-management', label: 'Manual Library', icon: FiBookOpen }]
      : []),
    ...(isForm337Enabled
      ? [{ path: '/form-337', label: 'FAA Form 337', icon: FiFileText }]
      : []),
  ];

  // One flat, grouped nav — every enabled destination is always visible.
  const navGroups: NavGroup[] = [
    ...(complianceCommandCenterItems.length
      ? [{ label: 'Command Center', items: complianceCommandCenterItems }]
      : []),
    { label: 'Audit Prep', items: auditPrepItems, kind: 'audit' as const },
    { label: 'Evidence', items: complianceEvidenceItems },
    { label: 'People', items: compliancePeopleItems },
    { label: 'Planning', items: compliancePlanningItems },
    { label: 'Assessment', items: complianceAssessmentItems },
    ...(isLogbookEnabled ? [{ label: 'Logbook', items: logbookItems }] : []),
    { label: 'Modules', items: moduleItems },
  ].filter((group) => group.items.length > 0);

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
          if (group.kind === 'audit') {
            const groupIsActive = group.items.some((item) => item.path === location.pathname);
            const collapsedAttention = !auditPrepOpen
              ? group.items.map((item) => navDotProps(item.path)).find(Boolean)
              : null;
            const guidedFirst = group.items[0]?.path === '/guided-audit';
            return (
              <div key={group.label} className="mb-3">
                <button
                  type="button"
                  onClick={toggleAuditPrep}
                  aria-expanded={auditPrepOpen}
                  className={`${navItemBaseClass} justify-between ${
                    groupIsActive && !auditPrepOpen
                      ? (isDarkMode
                        ? 'bg-gradient-to-r from-sky/20 to-sky-light/20 text-white border border-sky-light/30'
                        : 'bg-gradient-to-r from-sky-100 to-blue-100 text-slate-900 border border-sky-200')
                      : (isDarkMode
                        ? 'text-white/80 hover:text-white hover:bg-white/5'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100')
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <FiClipboard className={navIconClass} />
                    <span className="font-semibold truncate">Audit Prep</span>
                    {collapsedAttention && (
                      <NavAttentionDot
                        level={collapsedAttention.level}
                        isDarkMode={isDarkMode}
                        title={collapsedAttention.title}
                      />
                    )}
                  </span>
                  <FiChevronDown
                    className={`text-sm flex-shrink-0 transition-transform ${auditPrepOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {auditPrepOpen && (
                  <div className={`ml-3 pl-2 border-l ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                    {group.items.map((item, idx) => {
                      const Icon = item.icon;
                      const attention = navDotProps(item.path);
                      const activity = navActivityDotProps(item.path);
                      const isGuidedEntry = guidedFirst && idx === 0;
                      const stepNumber = guidedFirst ? idx : idx + 1;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => onNavigate?.()}
                          title={item.hint ? `${item.label} — ${item.hint}` : item.label}
                          className={({ isActive }) =>
                            `w-full flex items-start gap-3 px-3 py-1.5 rounded-lg mb-1 transition-all text-sm ${
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
                    })}
                  </div>
                )}
              </div>
            );
          }
          return (
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
                  end={item.path === '/' || item.end}
                  onClick={() => onNavigate?.()}
                  title={item.hint ? `${item.label} — ${item.hint}` : item.label}
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

        {myAdminCompanies && myAdminCompanies.length > 0 && (
          <NavLink
            to="/company-admin"
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
            <span className="font-medium">Company Admin</span>
          </NavLink>
        )}

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
