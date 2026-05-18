import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { LOGBOOK_REVIEW_STANDARD_MAP, type LogbookReviewStandard } from '../../../services/logbookReviewPrompt';
import { overallLabel, scoreBadgeClass, severityBadgeCls } from './reviewClient';
import type { CrossCheckOutcome, SmartReviewFinding, SmartReviewResult } from './types';

function severityIcon(s: SmartReviewFinding['severity']) {
  if (s === 'critical') return <FiAlertCircle className="text-red-400 flex-shrink-0 mt-0.5" />;
  if (s === 'major') return <FiAlertTriangle className="text-orange-400 flex-shrink-0 mt-0.5" />;
  return <FiCheckCircle className="text-sky-400 flex-shrink-0 mt-0.5" />;
}

export default function ReviewResultPanel({
  result,
  onDismiss,
}: {
  result: SmartReviewResult;
  onDismiss: () => void;
}) {
  const overall = overallLabel(result.overallCompliance);
  const ordered = [
    ...result.findings.filter((f) => f.severity === 'critical'),
    ...result.findings.filter((f) => f.severity === 'major'),
    ...result.findings.filter((f) => f.severity === 'advisory'),
  ];

  const applied = (result.standardsApplied ?? [])
    .map((id) => LOGBOOK_REVIEW_STANDARD_MAP[id as LogbookReviewStandard]?.shortLabel ?? id)
    .filter(Boolean);

  const crossCheckRows: Array<{ label: string; outcome?: CrossCheckOutcome }> = [
    { label: 'Roster match', outcome: result.crossChecks?.rosterMatch },
    { label: 'Capability scope', outcome: result.crossChecks?.capabilityScope },
    { label: 'OpSpec scope', outcome: result.crossChecks?.opSpecScope },
  ];
  const crossCheckCls = (outcome?: CrossCheckOutcome): string => {
    if (!outcome || outcome === 'not_applicable') return 'text-white/40 border-white/15';
    if (outcome === 'matched' || outcome === 'within_scope') return 'text-emerald-300 border-emerald-500/40';
    if (outcome === 'not_found' || outcome === 'outside_scope') return 'text-red-300 border-red-500/40';
    return 'text-amber-300 border-amber-500/40';
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${overall.cls}`}>{overall.label}</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${scoreBadgeClass(result.complianceScore)}`}>
            Score {result.complianceScore}/100
          </span>
          <span className="text-xs text-white/40 font-mono">
            {result.regulatoryFramework}
            {applied.length > 0 && ` · ${applied.join(', ')}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
          title="Clear result"
        >
          <FiRefreshCw className="text-sm" />
        </button>
      </div>
      {crossCheckRows.some((row) => row.outcome) && (
        <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-white/10 bg-white/[0.02]">
          {crossCheckRows.map((row) => (
            <span
              key={row.label}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${crossCheckCls(row.outcome)}`}
            >
              {row.label}: {(row.outcome ?? 'not_applicable').replace('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {ordered.length === 0 ? (
        <div className="px-5 py-8 flex flex-col items-center gap-2 text-emerald-400">
          <FiCheckCircle className="text-3xl" />
          <p className="text-sm font-medium">No compliance issues found</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] max-h-[min(60vh,480px)] overflow-y-auto">
          {ordered.map((f, i) => (
            <div key={i} className="px-5 py-4">
              <div className="flex items-start gap-3">
                {severityIcon(f.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${severityBadgeCls(f.severity)}`}
                    >
                      {f.severity}
                    </span>
                    <span className="text-xs font-mono text-white/50">{f.citation}</span>
                    {f.field && <span className="text-xs text-white/30">· {f.field}</span>}
                  </div>
                  <p className="text-sm text-white/85">{f.issue}</p>
                  {f.suggestedText && (
                    <div className="mt-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Suggested</p>
                      <p className="text-xs text-white/70 italic leading-relaxed">{f.suggestedText}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(result.suggestedWorkPerformed || result.suggestedRts) && (
        <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02] space-y-4">
          {result.suggestedWorkPerformed && (
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Suggested Work Performed
              </p>
              <p className="text-sm text-white/75 leading-relaxed">{result.suggestedWorkPerformed}</p>
            </div>
          )}
          {result.suggestedRts && (
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Suggested Return-to-Service Statement
              </p>
              <p className="text-sm text-white/75 leading-relaxed">{result.suggestedRts}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
