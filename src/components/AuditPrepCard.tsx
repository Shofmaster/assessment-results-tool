import { useNavigate } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  FiAlertTriangle,
  FiBookOpen,
  FiCheckSquare,
  FiChevronRight,
  FiClipboard,
  FiFileText,
  FiUsers,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import { useIsAerogapEmployee, useIsFeatureEnabled, useUserSettings } from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { useReadinessSummary } from '../hooks/useReadinessSummary';

type StepTone = 'overdue' | 'due_soon' | 'started' | 'none';

type AuditPrepStep = {
  path: string;
  label: string;
  detail: string;
  icon: IconType;
};

function statusPillClass(tone: StepTone, isDarkMode: boolean): string {
  switch (tone) {
    case 'overdue':
      return isDarkMode
        ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'
        : 'bg-rose-50 text-rose-700 border-rose-200';
    case 'due_soon':
      return isDarkMode
        ? 'bg-amber-400/15 text-amber-200 border-amber-300/40'
        : 'bg-amber-50 text-amber-700 border-amber-200';
    case 'started':
      return isDarkMode
        ? 'bg-sky/20 text-sky-lighter border-sky-light/30'
        : 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return isDarkMode
        ? 'bg-white/5 text-white/50 border-white/15'
        : 'bg-slate-100 text-slate-500 border-slate-200';
  }
}

function statusLabel(tone: StepTone): string {
  switch (tone) {
    case 'overdue':
      return 'Overdue items';
    case 'due_soon':
      return 'Due soon';
    case 'started':
      return 'Started';
    default:
      return 'Not started';
  }
}

/**
 * Splash-page shortcut into the audit-prep workflow: the same tools as the
 * sidebar "Audit Prep" dropdown, with per-step status from the command-center
 * readiness summary.
 */
export default function AuditPrepCard({ isDarkMode }: { isDarkMode: boolean }) {
  const navigate = useNavigate();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const isAerogapEmployee = useIsAerogapEmployee();
  const userSettings = useUserSettings() as { activeCompanyId?: string } | undefined;
  const { navDotProps, navActivityDotProps } = useReadinessSummary({
    isAerogapEmployee,
    activeCompanyId: userSettings?.activeCompanyId,
  });

  const isGuidedAuditEnabled = useIsFeatureEnabled(FEATURE_KEYS.GUIDED_AUDIT);
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isPaperworkReviewEnabled = useIsFeatureEnabled(FEATURE_KEYS.PAPERWORK_REVIEW);
  const isAuditSimEnabled = useIsFeatureEnabled(FEATURE_KEYS.AUDIT_SIMULATION);
  const isEntityIssuesEnabled = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isReportBuilderEnabled = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);

  const steps: AuditPrepStep[] = [
    ...(isChecklistsEnabled
      ? [{ path: '/checklists', label: 'Checklists', detail: 'Prep what auditors ask for', icon: FiCheckSquare }]
      : []),
    ...(isPaperworkReviewEnabled
      ? [{ path: '/review', label: 'Paperwork Review', detail: 'Check docs vs. references', icon: FiFileText }]
      : []),
    ...(isAuditSimEnabled
      ? [{ path: '/audit', label: 'Audit Simulation', detail: 'Practice with AI auditors', icon: FiUsers }]
      : []),
    ...(isEntityIssuesEnabled
      ? [{ path: '/entity-issues', label: 'CARs & Issues', detail: 'Fix findings before the audit', icon: FiAlertTriangle }]
      : []),
    ...(isReportBuilderEnabled
      ? [{ path: '/report', label: 'Report Builder', detail: 'Assemble the final report', icon: FiBookOpen }]
      : []),
  ];

  if (!isGuidedAuditEnabled && steps.length === 0) return null;

  const stepTone = (path: string): StepTone | null => {
    if (!activeProjectId) return null;
    const attention = navDotProps(path);
    if (attention) return attention.level;
    if (navActivityDotProps(path)) return 'started';
    return 'none';
  };

  return (
    <div
      className={`mt-6 rounded-2xl border p-5 ${
        isDarkMode ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-white/80 shadow-sm shadow-slate-300/20'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={`flex items-center gap-2 text-base font-semibold ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}
          >
            <FiClipboard className="shrink-0" />
            Audit Prep
          </h2>
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
            {activeProjectId
              ? 'Get audit-ready step by step, or run everything in one guided flow.'
              : 'Select a project to track your audit-prep status.'}
          </p>
        </div>
        {isGuidedAuditEnabled ? (
          <button
            type="button"
            onClick={() => navigate('/guided-audit')}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
              isDarkMode ? 'bg-sky hover:bg-sky-light' : 'bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-700/25'
            }`}
          >
            Start Guided Audit →
          </button>
        ) : null}
      </div>

      {steps.length > 0 ? (
        <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const tone = stepTone(step.path);
            return (
              <li key={step.path}>
                <button
                  type="button"
                  onClick={() => navigate(step.path)}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isDarkMode
                      ? 'border-white/10 bg-white/[0.03] hover:border-sky-light/30 hover:bg-sky/10'
                      : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isDarkMode ? 'bg-sky/25 text-sky-100' : 'bg-sky-600 text-white'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`flex items-center gap-1.5 text-sm font-medium ${
                        isDarkMode ? 'text-white/90' : 'text-slate-800'
                      }`}
                    >
                      <Icon className="shrink-0 text-[13px] opacity-70" />
                      <span className="truncate">{step.label}</span>
                    </span>
                    <span className={`block truncate text-xs ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
                      {step.detail}
                    </span>
                  </span>
                  {tone ? (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPillClass(
                        tone,
                        isDarkMode,
                      )}`}
                    >
                      {statusLabel(tone)}
                    </span>
                  ) : null}
                  <FiChevronRight
                    className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${
                      isDarkMode ? 'text-white/40' : 'text-slate-400'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
