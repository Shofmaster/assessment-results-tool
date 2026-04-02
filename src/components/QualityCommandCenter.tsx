import { useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '../hooks/useConvexQueryNoThrow';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiFileText,
  FiFolder,
  FiGrid,
  FiList,
  FiUsers,
} from 'react-icons/fi';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import { FEATURE_KEYS } from '../config/featureKeys';
import { useIsFeatureEnabled } from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { useTheme } from '../context/ThemeContext';
import { Button, GlassCard } from './ui';

type PrepStep = {
  step: number;
  title: string;
  description: string;
  path: string;
  icon: typeof FiFolder;
  enabled: boolean;
};

export default function QualityCommandCenter() {
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

  const summary = useQuery(
    api.qualityDashboard.getCommandCenterSummary,
    activeProjectId ? { projectId: activeProjectId as any } : 'skip',
  );

  const isQualityHubEnabled = useIsFeatureEnabled(FEATURE_KEYS.QUALITY_COMMAND_CENTER);
  const isLibraryEnabled = useIsFeatureEnabled(FEATURE_KEYS.LIBRARY);
  const isPaperworkReviewEnabled = useIsFeatureEnabled(FEATURE_KEYS.PAPERWORK_REVIEW);
  const isAnalysisEnabled = useIsFeatureEnabled(FEATURE_KEYS.ANALYSIS);
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isGuidedAuditEnabled = useIsFeatureEnabled(FEATURE_KEYS.GUIDED_AUDIT);
  const isAuditSimEnabled = useIsFeatureEnabled(FEATURE_KEYS.AUDIT_SIMULATION);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isEntityIssuesEnabled = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isRevisionsEnabled = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);

  const prepSteps: PrepStep[] = [
    {
      step: 1,
      title: 'Document library',
      description: 'Upload or link controlled manuals, MOE/QCM, and evidence packages.',
      path: '/library',
      icon: FiFolder,
      enabled: isLibraryEnabled,
    },
    {
      step: 2,
      title: 'Paperwork review',
      description: 'Run AI-assisted document review against auditor personas.',
      path: '/review',
      icon: FiFileText,
      enabled: isPaperworkReviewEnabled,
    },
    {
      step: 3,
      title: 'Compliance analysis',
      description: 'Analyze imported assessments with citations and findings.',
      path: '/analysis',
      icon: FiClipboard,
      enabled: isAnalysisEnabled,
    },
    {
      step: 4,
      title: 'Audit checklists',
      description: 'Structured readiness checks for Part 145, IS-BAO, EASA, AS9100, and more.',
      path: '/checklists',
      icon: FiCheckSquare,
      enabled: isChecklistsEnabled,
    },
    {
      step: 5,
      title: 'Guided audit',
      description: 'Walk-through audit with structured outputs and PDF export.',
      path: '/guided-audit',
      icon: FiList,
      enabled: isGuidedAuditEnabled,
    },
    {
      step: 6,
      title: 'Audit simulation (advanced)',
      description: 'Multi-agent rehearsal — optional when enabled for your organization.',
      path: '/audit',
      icon: FiUsers,
      enabled: isAuditSimEnabled,
    },
    {
      step: 7,
      title: 'CARs & issues',
      description: 'Log and track corrective actions tied to findings.',
      path: '/entity-issues',
      icon: FiAlertTriangle,
      enabled: isEntityIssuesEnabled,
    },
    {
      step: 8,
      title: 'Roster & training currency',
      description: 'Personnel qualifications, recurrent items, and due dates.',
      path: '/roster',
      icon: FiUsers,
      enabled: isEntityIssuesEnabled,
    },
    {
      step: 9,
      title: 'Revision tracker',
      description: 'Monitor manual document revision drift vs known sources.',
      path: '/revisions',
      icon: FiFileText,
      enabled: isRevisionsEnabled,
    },
    {
      step: 10,
      title: 'Report builder',
      description: 'Compile analysis, CARs, reviews, and schedules into one package.',
      path: '/report',
      icon: FiFileText,
      enabled: isReportBuilderEnabled,
    },
  ];

  if (!isQualityHubEnabled) {
    return <Navigate to="/splash" replace />;
  }

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full min-h-0">
        <GlassCard padding="xl" className="text-center max-w-lg mx-auto">
          <FiGrid className="w-10 h-10 mx-auto mb-3 opacity-60" />
          <h2 className={`text-2xl font-display font-bold mb-2 ${heading}`}>Select a project</h2>
          <p className={`${muted} mb-6`}>
            Choose a project from the sidebar to see readiness data and the audit prep workflow.
          </p>
          <Button onClick={() => navigate('/splash')}>Back to home</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="p-3 sm:p-6 lg:p-8 w-full min-w-0 flex flex-col min-h-0 h-full overflow-y-auto scrollbar-thin"
    >
      <div className="mb-8">
        <h1 className={`text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r ${isDarkMode ? 'from-white to-sky-lighter' : 'from-slate-900 to-sky-800'} bg-clip-text text-transparent`}>
          Quality command center
        </h1>
        <p className={`text-lg ${muted}`}>
          Chief Inspector / Quality Manager view — open CARs, training currency, checklist progress, and recurring inspections in one place, plus a guided path through audit prep tools.
        </p>
      </div>

      {/* Dashboard */}
      <section className="mb-10">
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${subhead}`}>
          Readiness snapshot
        </h2>
        {summary === undefined ? (
          <div className={`rounded-xl border ${cardBorder} p-8 text-center ${muted}`}>Loading&hellip;</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiAlertTriangle className={isDarkMode ? 'text-red-300' : 'text-red-600'} />
                <span className={`text-sm font-semibold ${heading}`}>CARs overdue</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {summary.issues.overdue.length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>
                Open items past due date (max {summary.issues.total} CARs loaded)
              </p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiUsers className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Roster overdue</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {summary.roster.overdueAssignments.length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>Training / qualification assignments past due</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiCheckSquare className={isDarkMode ? 'text-sky-300' : 'text-sky-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Active checklists</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {summary.checklists.length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>Draft or active runs in this project</p>
            </GlassCard>
            <GlassCard className={`!p-4 ${kpiBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FiCalendar className={isDarkMode ? 'text-emerald-300' : 'text-emerald-700'} />
                <span className={`text-sm font-semibold ${heading}`}>Inspection alerts</span>
              </div>
              <div className={`text-3xl font-display font-bold ${heading}`}>
                {summary.inspectionSchedule.alerts.length}
              </div>
              <p className={`text-xs mt-1 ${subhead}`}>Overdue or due within 30 days (calendar intervals)</p>
            </GlassCard>
          </div>
        )}

        {summary && (
          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <GlassCard className="!p-4 overflow-hidden">
              <h3 className={`text-sm font-semibold mb-3 ${heading}`}>CAR status (loaded)</h3>
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
              {summary.issues.overdue.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>Overdue</p>
                  <ul className="text-xs space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                    {summary.issues.overdue.map((i: { _id: string; carNumber?: string; title: string; dueDate?: string }) => (
                      <li key={i._id} className={muted}>
                        <span className="font-mono text-white/80">{i.carNumber ?? i._id.slice(-6)}</span>
                        {' — '}
                        {i.title}
                        {i.dueDate ? ` (due ${i.dueDate.slice(0, 10)})` : ''}
                      </li>
                    ))}
                  </ul>
                  {isEntityIssuesEnabled && (
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/entity-issues')}>
                      Open CARs
                    </Button>
                  )}
                </div>
              )}
            </GlassCard>

            <GlassCard className="!p-4 overflow-hidden">
              <h3 className={`text-sm font-semibold mb-3 ${heading}`}>Checklist progress</h3>
              {summary.checklists.length === 0 ? (
                <p className={`text-sm ${muted}`}>No active or draft checklist runs.</p>
              ) : (
                <ul className="text-sm space-y-3 max-h-56 overflow-y-auto scrollbar-thin">
                  {summary.checklists.map((run: { runId: string; name?: string; frameworkLabel: string; status: string; total: number; complete: number; inProgress: number }) => (
                    <li key={run.runId} className={muted}>
                      <div className={`font-medium ${heading}`}>
                        {run.name || run.frameworkLabel}
                      </div>
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
                  ))}
                </ul>
              )}
              {isChecklistsEnabled && (
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/checklists')}>
                  Open checklists
                </Button>
              )}
            </GlassCard>

            <GlassCard className="!p-4 overflow-hidden lg:col-span-2">
              <h3 className={`text-sm font-semibold mb-3 ${heading}`}>Recurring inspections</h3>
              {summary.inspectionSchedule.alerts.length === 0 ? (
                <p className={`text-sm ${muted}`}>
                  No overdue or due-soon calendar items (or intervals are not calendar-based / missing last performed date).
                </p>
              ) : (
                <ul className="text-sm grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto scrollbar-thin">
                  {summary.inspectionSchedule.alerts.map((a: { itemId: string; title: string; nextDue: string; kind: string; regulationRef?: string | null }) => (
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
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>
        )}
      </section>

      {/* Audit prep workflow */}
      <section>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${subhead}`}>
          Audit prep workflow
        </h2>
        <p className={`text-sm mb-4 ${muted}`}>
          Follow the steps in order for a typical audit readiness pass. Disabled steps are turned off for your account or organization.
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
    </div>
  );
}
