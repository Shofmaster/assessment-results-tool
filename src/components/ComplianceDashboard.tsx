import { useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiClock,
  FiFileText,
  FiFolder,
  FiList,
  FiRefreshCw,
  FiUsers,
  FiLayers,
} from 'react-icons/fi';
import { useQuery } from '../hooks/useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import { FEATURE_KEYS } from '../config/featureKeys';
import {
  useIsAerogapEmployee,
  useIsFeatureEnabled,
  useIsLogbookEnabled,
  useIsQualityCommandHubAvailable,
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { useTheme } from '../context/ThemeContext';
import { Button, GlassCard } from './ui';
import RosterComplianceDashboard from './roster/RosterComplianceDashboard';
import ComingDueCard from './dashboard/ComingDueCard';
import AdWatchCard from './dashboard/AdWatchCard';

type NavItem = { id: string; label: string; href: string; show: boolean };

type PrepStep = {
  step: number;
  title: string;
  description: string;
  path: string;
  icon: typeof FiFolder;
  enabled: boolean;
};

export default function ComplianceDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const muted = isDarkMode ? 'text-white/60' : 'text-slate-600';
  const heading = isDarkMode ? 'text-white' : 'text-slate-900';
  const subhead = isDarkMode ? 'text-white/45' : 'text-slate-500';
  const cardBorder = isDarkMode ? 'border-white/10' : 'border-slate-200';
  const kpiBg = isDarkMode ? 'bg-white/5' : 'bg-slate-50';
  const stickyNavClass = isDarkMode
    ? 'border-white/10 bg-navy-900/95 backdrop-blur-md'
    : 'border-slate-200/90 bg-white/90 backdrop-blur-md';
  const navChipClass = () =>
    `shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      isDarkMode
        ? 'border-white/15 text-white/75 hover:border-white/25 hover:bg-white/5'
        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
    }`;

  const summary = useQuery(
    api.qualityDashboard.getCommandCenterSummary,
    activeProjectId ? { projectId: activeProjectId as any } : 'skip',
  );

  const isQualityHubEnabled = useIsQualityCommandHubAvailable();
  const isLibraryEnabled = useIsFeatureEnabled(FEATURE_KEYS.LIBRARY);
  const isPaperworkReviewEnabled = useIsFeatureEnabled(FEATURE_KEYS.PAPERWORK_REVIEW);
  const isAerogapEmployee = useIsAerogapEmployee();
  const isAnalysisEnabled = useIsFeatureEnabled(FEATURE_KEYS.ANALYSIS);
  const canUseAnalysis = isAnalysisEnabled && isAerogapEmployee;
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isGuidedAuditEnabled = useIsFeatureEnabled(FEATURE_KEYS.GUIDED_AUDIT);
  const isAuditSimEnabled = useIsFeatureEnabled(FEATURE_KEYS.AUDIT_SIMULATION);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isEntityIssuesEnabled = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isRevisionsEnabled = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);
  const isDctComplianceEnabled = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const isLogbookEnabled = useIsLogbookEnabled();
  const isScheduleEnabled = useIsFeatureEnabled(FEATURE_KEYS.SCHEDULE);
  const isDueForecastEnabled = useIsFeatureEnabled(FEATURE_KEYS.DUE_FORECAST);
  const isAdWatchEnabled = useIsFeatureEnabled(FEATURE_KEYS.AD_WATCH);

  const prepSteps: PrepStep[] = [
    {
      step: 1,
      title: 'Document Library',
      description: 'Upload or link controlled manuals, MOE/QCM, and evidence packages.',
      path: '/library',
      icon: FiFolder,
      enabled: isLibraryEnabled,
    },
    {
      step: 2,
      title: 'Paperwork Review',
      description: 'Run AI-assisted document review against auditor personas.',
      path: '/review',
      icon: FiFileText,
      enabled: isPaperworkReviewEnabled,
    },
    {
      step: 3,
      title: 'DCT Compliance',
      description: 'Map manuals to FAA SAS DCT questions, track revisions, and export traceability reports.',
      path: '/dct-compliance',
      icon: FiLayers,
      enabled: isDctComplianceEnabled,
    },
    {
      step: 4,
      title: 'Compliance Analysis',
      description: 'Analyze imported assessments with citations and findings.',
      path: '/analysis',
      icon: FiClipboard,
      enabled: canUseAnalysis,
    },
    {
      step: 5,
      title: 'Audit Checklists',
      description: 'Structured readiness checks for Part 145, IS-BAO, EASA, AS9100, and more.',
      path: '/checklists',
      icon: FiCheckSquare,
      enabled: isChecklistsEnabled,
    },
    {
      step: 6,
      title: 'Recurring Compliance',
      description: 'Manage recurring schedule requirements and upcoming due work.',
      path: '/schedule',
      icon: FiCalendar,
      enabled: isScheduleEnabled,
    },
    {
      step: 7,
      title: 'Guided Audit',
      description: 'Walk-through audit with structured outputs and PDF export.',
      path: '/guided-audit',
      icon: FiList,
      enabled: isGuidedAuditEnabled,
    },
    {
      step: 8,
      title: 'Audit Simulation (Advanced)',
      description: 'Multi-agent rehearsal — optional when enabled for your organization.',
      path: '/audit',
      icon: FiUsers,
      enabled: isAuditSimEnabled,
    },
    {
      step: 9,
      title: 'CARs & Issues',
      description: 'Log and track corrective actions tied to findings.',
      path: '/entity-issues',
      icon: FiAlertTriangle,
      enabled: isEntityIssuesEnabled,
    },
    {
      step: 10,
      title: 'Roster & Training Currency',
      description: 'Personnel qualifications, recurrent items, and due dates.',
      path: '/roster',
      icon: FiUsers,
      enabled: isEntityIssuesEnabled,
    },
    {
      step: 11,
      title: 'Revision Tracker',
      description: 'Monitor manual document revision drift vs known sources.',
      path: '/revisions',
      icon: FiFileText,
      enabled: isRevisionsEnabled,
    },
    {
      step: 12,
      title: 'Report Builder',
      description: 'Compile analysis, CARs, reviews, and schedules into one package.',
      path: '/report',
      icon: FiFileText,
      enabled: isReportBuilderEnabled,
    },
  ];

  const navItems: NavItem[] = [
    { id: 'summary', label: 'Summary', href: '#summary', show: true },
    { id: 'audit-prep', label: 'Audit Prep', href: '#audit-prep', show: true },
    { id: 'personnel', label: 'Personnel', href: '#personnel', show: isEntityIssuesEnabled },
    { id: 'cars', label: 'CARs', href: '#cars', show: isEntityIssuesEnabled },
    { id: 'inspections', label: 'Inspections', href: '#inspections', show: isScheduleEnabled || isLogbookEnabled },
    { id: 'checklists', label: 'Checklists', href: '#checklists', show: isChecklistsEnabled },
    { id: 'cycles', label: 'Cycles', href: '#cycles', show: isChecklistsEnabled },
    { id: 'revisions', label: 'Revisions', href: '#revisions', show: isRevisionsEnabled },
  ];

  const visibleNav = navItems.filter((n) => n.show);

  if (!isQualityHubEnabled) {
    return <Navigate to="/splash" replace />;
  }

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full min-h-0">
        <GlassCard padding="xl" className="text-center max-w-lg mx-auto">
          <FiCalendar className="w-10 h-10 mx-auto mb-3 opacity-60" />
          <h2 className={`text-2xl font-display font-bold mb-2 ${heading}`}>Select a project</h2>
          <p className={`${muted} mb-6`}>
            Choose a project from the sidebar to see overdue items, due-soon work, and training currency.
          </p>
          <Button onClick={() => navigate('/splash')}>Back to home</Button>
        </GlassCard>
      </div>
    );
  }

  const issueDueSoon = (summary?.issues as { dueSoon?: unknown[] } | undefined)?.dueSoon ?? [];
  const occurrenceAlerts = summary?.checklistOccurrenceAlerts ?? [];
  const revisionItems = summary?.revisionDrift?.items ?? [];

  return (
    <div
      ref={containerRef}
      className="p-3 sm:p-6 lg:p-8 w-full min-w-0 flex flex-col"
    >
      <div className="mb-6">
        <h1
          className={`text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r ${
            isDarkMode ? 'from-white to-sky-lighter' : 'from-slate-900 to-sky-800'
          } bg-clip-text text-transparent`}
        >
          Quality & Compliance
        </h1>
        <p className={`text-lg ${muted}`}>
          Chief Inspector / Quality Manager hub — readiness summary, audit prep shortcuts, and detailed CARs, roster,
          inspections, checklists, and revision drift. Jump to any section below.
        </p>
      </div>

      <nav
        className={`sticky top-0 z-20 -mx-1 mb-6 flex gap-2 overflow-x-auto scrollbar-thin py-2 px-1 border-b ${stickyNavClass}`}
        aria-label="Sections on this page"
      >
        {visibleNav.map((item) => (
          <a key={item.id} href={item.href} className={navChipClass()}>
            {item.label}
          </a>
        ))}
      </nav>

      <section id="summary" className="scroll-mt-24 mb-10">
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>Summary</h2>
        {summary === undefined ? (
          <div className={`rounded-xl border ${cardBorder} p-8 text-center ${muted}`}>Loading&hellip;</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isDueForecastEnabled && activeProjectId ? (
              <div className="sm:col-span-2">
                <ComingDueCard projectId={activeProjectId} />
              </div>
            ) : null}
            {isAdWatchEnabled && activeProjectId ? (
              <div className="sm:col-span-2">
                <AdWatchCard projectId={activeProjectId} />
              </div>
            ) : null}
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiAlertTriangle className={isDarkMode ? 'text-red-300' : 'text-red-600'} />
                <span className={`text-sm font-semibold ${heading}`}>CARs overdue</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>{summary.issues.overdue.length}</div>
              <p className={`text-xs mt-1 ${subhead}`}>Open through due date</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiClock className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
                <span className={`text-sm font-semibold ${heading}`}>CARs due soon</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>{issueDueSoon.length}</div>
              <p className={`text-xs mt-1 ${subhead}`}>Due within 30 days</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiUsers className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Roster overdue</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {summary.roster.overdueAssignments.length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>Assignments past due (calendar)</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiCheckSquare className={isDarkMode ? 'text-sky-300' : 'text-sky-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Active checklists</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>{summary.checklists.length}</div>
              <p className={`text-xs mt-1 ${subhead}`}>Draft or active runs</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiCalendar className={isDarkMode ? 'text-emerald-300' : 'text-emerald-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Inspection alerts</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {summary.inspectionSchedule.alerts.length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>Schedule (calendar intervals)</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiCheckSquare className={isDarkMode ? 'text-violet-300' : 'text-violet-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Checklist items due</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {(summary.checklistDueAlerts ?? []).length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>Line items overdue / due soon</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiClock className={isDarkMode ? 'text-violet-300' : 'text-violet-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Open cycle dues</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>{occurrenceAlerts.length}</div>
              <p className={`text-xs mt-1 ${subhead}`}>Planned cycle dates</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiRefreshCw className={isDarkMode ? 'text-orange-300' : 'text-orange-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Revision drift</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>{revisionItems.length}</div>
              <p className={`text-xs mt-1 ${subhead}`}>Not on latest known revision</p>
            </GlassCard>
            {summary.profileSummary && (
              <GlassCard className={`!p-4 ${kpiBg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <FiLayers className={isDarkMode ? 'text-cyan-300' : 'text-cyan-700'} />
                  <span className={`text-sm font-semibold ${heading}`}>Certificate profiles</span>
                </div>
                <div className={`text-3xl font-display font-bold ${heading}`}>
                  {Object.keys(summary.profileSummary.totalsByCertificateType || {}).length}
                </div>
                <p className={`text-xs mt-1 ${subhead}`}>Profile-aware reporting enabled</p>
              </GlassCard>
            )}
          </div>
        )}
      </section>

      <section id="audit-prep" className="scroll-mt-24 mb-10">
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${subhead}`}>Audit Prep Workflow</h2>
        <p className={`text-sm mb-4 ${muted}`}>
          Follow the steps in order for a typical audit readiness pass. Disabled steps are turned off for your account or
          organization.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {prepSteps
            .filter((s) => s.enabled)
            .map((s) => (
              <button
                key={s.step}
                type="button"
                onClick={() => navigate(s.path)}
                className={`text-left rounded-xl border p-4 transition-all hover:border-sky-500/40 hover:bg-white/5 ${cardBorder}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                      isDarkMode ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-900'
                    }`}
                  >
                    {s.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`flex items-center gap-1 font-semibold ${heading}`}>
                      <s.icon className="text-[15px] opacity-70 flex-shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${muted}`}>{s.description}</p>
                    <span className="inline-flex items-center gap-1 text-xs text-sky-light mt-2 font-medium">
                      Open <FiArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
        </div>
        {prepSteps.every((s) => !s.enabled) && (
          <p className={`text-sm mt-4 ${muted}`}>
            No compliance modules are enabled — ask your administrator to turn on features in company policy.
          </p>
        )}
      </section>

      {isEntityIssuesEnabled && (
        <section id="personnel" className="scroll-mt-24 mb-10">
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>Personnel</h2>
          <RosterComplianceDashboard />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => navigate('/roster')}>
              Edit roster
            </Button>
          </div>
        </section>
      )}

      {isEntityIssuesEnabled && summary && (
        <section id="cars" className="scroll-mt-24 mb-10">
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>CARs and issues</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="!p-4 overflow-hidden">
              <h3 className={`text-sm font-semibold mb-3 ${heading}`}>Status (loaded sample)</h3>
              <ul className={`text-sm space-y-1 max-h-40 overflow-y-auto scrollbar-thin ${muted}`}>
                {Object.entries(summary.issues.statusCounts).length === 0 ? (
                  <li>No CARs in this project yet.</li>
                ) : (
                  (Object.entries(summary.issues.statusCounts) as [string, number][]).map(([st, n]) => (
                    <li key={st} className="flex justify-between gap-2">
                      <span className="capitalize">{st.replace(/_/g, ' ')}</span>
                      <span className={heading}>{n}</span>
                    </li>
                  ))
                )}
              </ul>
              {(summary.issues.overdue.length > 0 || issueDueSoon.length > 0) && (
                <div className={`mt-3 pt-3 border-t space-y-3 ${cardBorder}`}>
                  {summary.issues.overdue.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                        Overdue
                      </p>
                      <ul className="text-xs space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                        {summary.issues.overdue.map(
                          (i: { _id: string; carNumber?: string; title: string; dueDate?: string }) => (
                            <li key={i._id} className={muted}>
                              <span className="font-mono opacity-80">{i.carNumber ?? i._id.slice(-6)}</span>
                              {' — '}
                              {i.title}
                              {i.dueDate ? ` (due ${i.dueDate.slice(0, 10)})` : ''}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  {issueDueSoon.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                        Due within 30 days
                      </p>
                      <ul className="text-xs space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                        {(issueDueSoon as { _id: string; carNumber?: string; title: string; dueDate?: string }[]).map(
                          (i) => (
                            <li key={i._id} className={muted}>
                              <span className="font-mono opacity-80">{i.carNumber ?? i._id.slice(-6)}</span>
                              {' — '}
                              {i.title}
                              {i.dueDate ? ` (due ${i.dueDate.slice(0, 10)})` : ''}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => navigate('/entity-issues')}>
                    Open CARs
                  </Button>
                </div>
              )}
            </GlassCard>

            <GlassCard className="!p-4 overflow-hidden">
              <h3 className={`text-sm font-semibold mb-3 ${heading}`}>Roster assignments past due</h3>
              {summary.roster.overdueAssignments.length === 0 ? (
                <p className={`text-sm ${muted}`}>No overdue assignments in the loaded sample.</p>
              ) : (
                <ul className={`text-sm space-y-2 max-h-56 overflow-y-auto scrollbar-thin ${muted}`}>
                  {summary.roster.overdueAssignments.map(
                    (r: { assignmentId: string; personName: string; requirementName: string; dueDate: string }) => (
                      <li
                        key={r.assignmentId}
                        className={`rounded-lg border px-3 py-2 ${cardBorder} ${
                          isDarkMode ? 'border-red-500/30 bg-red-500/5' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <span className={`font-medium ${heading}`}>{r.personName}</span>
                        <div className={`text-xs mt-1 ${subhead}`}>
                          {r.requirementName} — due {r.dueDate.slice(0, 10)}
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate('/roster')}>
                Open roster
              </Button>
            </GlassCard>
          </div>
        </section>
      )}

      {(isScheduleEnabled || isLogbookEnabled) && summary && (
        <section id="inspections" className="scroll-mt-24 mb-10">
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>Recurring inspections</h2>
          <GlassCard className="!p-4 overflow-hidden">
            {summary.inspectionSchedule.alerts.length === 0 ? (
              <p className={`text-sm ${muted}`}>
                No overdue or due-soon calendar items in the loaded set, or intervals are not calendar-based.
              </p>
            ) : (
              <ul className="text-sm grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto scrollbar-thin">
                {summary.inspectionSchedule.alerts.map(
                  (a: { itemId: string; title: string; nextDue: string; kind: string; regulationRef?: string | null }) => (
                    <li
                      key={a.itemId}
                      className={`rounded-lg border px-3 py-2 ${cardBorder} ${
                        a.kind === 'overdue'
                          ? isDarkMode
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'border-red-200 bg-red-50'
                          : ''
                      }`}
                    >
                      <span className={`font-medium ${heading}`}>{a.title}</span>
                      <div className={`text-xs mt-1 ${muted}`}>
                        {a.kind === 'overdue' ? 'Overdue' : 'Due soon'} — next {a.nextDue}
                        {a.regulationRef ? ` · ${a.regulationRef}` : ''}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate('/schedule')}>
              Open schedule
            </Button>
          </GlassCard>
        </section>
      )}

      {isChecklistsEnabled && summary && (
        <>
          <section id="checklists" className="scroll-mt-24 mb-10">
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>Checklist progress</h2>
            <GlassCard className="!p-4 overflow-hidden mb-4">
              {summary.checklists.length === 0 ? (
                <p className={`text-sm ${muted}`}>No active or draft checklist runs.</p>
              ) : (
                <ul className="text-sm space-y-3 max-h-56 overflow-y-auto scrollbar-thin">
                  {summary.checklists.map(
                    (run: {
                      runId: string;
                      name?: string;
                      frameworkLabel: string;
                      status: string;
                      total: number;
                      complete: number;
                      inProgress: number;
                    }) => (
                      <li key={run.runId} className={muted}>
                        <div className={`font-medium ${heading}`}>{run.name || run.frameworkLabel}</div>
                        <div className="text-xs mt-0.5">
                          {run.complete}/{run.total} complete
                          {run.inProgress ? ` · ${run.inProgress} in progress` : ''}
                          <span className="ml-1 opacity-70">({run.status})</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-sky-500/80 rounded-full transition-all"
                            style={{ width: `${run.total ? (run.complete / run.total) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </GlassCard>
            <h3 className={`text-sm font-semibold mb-3 ${heading}`}>Checklist items due</h3>
            <GlassCard className="!p-4 overflow-hidden">
              {(summary.checklistDueAlerts ?? []).length === 0 ? (
                <p className={`text-sm ${muted}`}>
                  No incomplete items with a due date in the next 30 days or overdue in the loaded sample.
                </p>
              ) : (
                <ul className="text-sm space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                  {(summary.checklistDueAlerts ?? []).map(
                    (a: {
                      itemId: string;
                      checklistRunId: string;
                      title: string;
                      runName?: string | null;
                      frameworkLabel: string;
                      nextDue: string;
                      kind: string;
                      owner?: string | null;
                    }) => (
                      <li
                        key={a.itemId}
                        className={`rounded-lg border px-3 py-2 ${cardBorder} ${
                          a.kind === 'overdue'
                            ? isDarkMode
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-red-200 bg-red-50'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          className={`text-left w-full font-medium ${heading}`}
                          onClick={() => navigate(`/checklists?runId=${encodeURIComponent(a.checklistRunId)}`)}
                        >
                          {a.title}
                        </button>
                        <div className={`text-xs mt-1 ${muted}`}>
                          {a.kind === 'overdue' ? 'Overdue' : 'Due soon'} — {a.nextDue}
                          {a.runName ? ` · ${a.runName}` : ` · ${a.frameworkLabel}`}
                          {a.owner ? ` · Owner: ${a.owner}` : ''}
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate('/checklists')}>
                Open checklists
              </Button>
            </GlassCard>
          </section>

          <section id="cycles" className="scroll-mt-24 mb-10">
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>Open checklist cycles</h2>
            <GlassCard className="!p-4 overflow-hidden">
              {occurrenceAlerts.length === 0 ? (
                <p className={`text-sm ${muted}`}>
                  No open checklist cycles with a planned due date in the next 30 days or overdue.
                </p>
              ) : (
                <ul className="text-sm space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                  {occurrenceAlerts.map(
                    (a: {
                      occurrenceId: string;
                      checklistRunId: string;
                      plannedDue: string;
                      kind: string;
                      seriesName?: string;
                      occurrenceLabel?: string | null;
                      runName?: string | null;
                    }) => (
                      <li
                        key={a.occurrenceId}
                        className={`rounded-lg border px-3 py-2 ${cardBorder} ${
                          a.kind === 'overdue'
                            ? isDarkMode
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-red-200 bg-red-50'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          className={`text-left w-full font-medium ${heading}`}
                          onClick={() => navigate(`/checklists?runId=${encodeURIComponent(a.checklistRunId)}`)}
                        >
                          {a.seriesName ?? a.runName ?? 'Checklist cycle'}
                          {a.occurrenceLabel ? ` · ${a.occurrenceLabel}` : ''}
                        </button>
                        <div className={`text-xs mt-1 ${muted}`}>
                          {a.kind === 'overdue' ? 'Overdue' : 'Due soon'} — planned {a.plannedDue}
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate('/checklists')}>
                Open checklists
              </Button>
            </GlassCard>
          </section>
        </>
      )}

      {isRevisionsEnabled && summary && (
        <section id="revisions" className="scroll-mt-24 mb-10">
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>Revision drift</h2>
          <GlassCard className="!p-4 overflow-hidden">
            {revisionItems.length === 0 ? (
              <p className={`text-sm ${muted}`}>
                No documents flagged as not on the latest known revision in the loaded sample.
              </p>
            ) : (
              <ul className={`text-sm space-y-2 max-h-64 overflow-y-auto scrollbar-thin ${muted}`}>
                {(revisionItems as { revisionId: string; documentName: string; detectedRevision: string; latestKnownRevision: string }[]).map(
                  (r) => (
                    <li
                      key={r.revisionId}
                      className={`rounded-lg border px-3 py-2 ${cardBorder} ${
                        isDarkMode ? 'border-orange-500/25 bg-orange-500/5' : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <span className={`font-medium ${heading}`}>{r.documentName}</span>
                      <div className={`text-xs mt-1 ${subhead}`}>
                        Tracked {r.detectedRevision} — latest known {r.latestKnownRevision}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate('/revisions')}>
              Open revision tracker
            </Button>
          </GlassCard>
        </section>
      )}
    </div>
  );
}
