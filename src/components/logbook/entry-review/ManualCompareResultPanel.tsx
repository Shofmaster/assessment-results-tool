import { FiAlertTriangle, FiLoader, FiRefreshCw } from 'react-icons/fi';
import type { ManualComparisonItem, ManualComparisonResult } from '../../../services/manualLogbookComparison';

function manualItemStatusCls(s: ManualComparisonItem['status']): string {
  if (s === 'matched') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
  if (s === 'missing') return 'text-red-300 bg-red-500/15 border-red-500/30';
  return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
}

function ManualCompareRow({ item }: { item: ManualComparisonItem }) {
  return (
    <div className="px-5 py-3 border-b border-white/[0.06] last:border-b-0">
      <div className="flex items-start gap-2 flex-wrap mb-1.5">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${manualItemStatusCls(item.status)}`}
        >
          {item.status}
        </span>
      </div>
      <p className="text-sm text-white/85 mb-2">{item.requirementText}</p>
      {item.manualEvidence ? (
        <p className="text-xs text-white/45 font-mono leading-relaxed mb-1">
          <span className="text-white/30">Manual: </span>
          {item.manualEvidence}
        </p>
      ) : null}
      {item.logEvidence ? (
        <p className="text-xs text-sky-light/70 font-mono leading-relaxed mb-1">
          <span className="text-white/30">Log: </span>
          {item.logEvidence}
        </p>
      ) : null}
      {item.notes ? <p className="text-xs text-white/40 italic mt-1">{item.notes}</p> : null}
    </div>
  );
}

export default function ManualCompareResultPanel({
  result,
  onDismiss,
  onSaveGaps,
  canSaveGaps,
  savingGaps,
}: {
  result: ManualComparisonResult;
  onDismiss: () => void;
  onSaveGaps: () => void;
  canSaveGaps: boolean;
  savingGaps: boolean;
}) {
  const matched = result.requiredItems.filter((i) => i.status === 'matched');
  const missing = result.requiredItems.filter((i) => i.status === 'missing');
  const unclear = result.requiredItems.filter((i) => i.status === 'unclear');
  const gapCount = missing.length + unclear.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-white/70">Manual vs log</span>
          <span className="text-xs font-mono text-white/40">{result.inspectionType || '—'}</span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300/90">
            matched {result.summary.matched}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-300/90">
            missing {result.summary.missing}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-300/90">
            unclear {result.summary.unclear}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {gapCount > 0 && (
            <button
              type="button"
              disabled={!canSaveGaps || savingGaps}
              onClick={onSaveGaps}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {savingGaps ? <FiLoader className="animate-spin" /> : <FiAlertTriangle />}
              Save {gapCount} gap{gapCount === 1 ? '' : 's'} as findings
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            title="Clear result"
          >
            <FiRefreshCw className="text-sm" />
          </button>
        </div>
      </div>

      {(result.truncatedManual || result.truncatedRequirements) && (
        <div className="px-5 py-2 text-[11px] text-amber-300/90 border-b border-white/10 bg-amber-500/10">
          {result.truncatedManual && (
            <p>
              Manual text was trimmed to fit analysis limits ({result.manualCharsUsed?.toLocaleString()} characters
              used).
            </p>
          )}
          {result.truncatedRequirements && (
            <p>
              Only the first {result.requirementsCap} extracted requirements were compared — shorten the manual excerpt
              or split uploads for full coverage.
            </p>
          )}
        </div>
      )}

      {result.requiredItems.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-white/50">
          No required items were extracted for this inspection type. Try a more specific manual section, or adjust the
          inspection label (e.g. &quot;96/144&quot;, &quot;12-month&quot;).
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] max-h-[min(60vh,480px)] overflow-y-auto">
          {missing.length > 0 && (
            <div>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-red-300/80 bg-red-500/5">
                Missing in log
              </div>
              {missing.map((item, i) => (
                <ManualCompareRow key={`m-${i}`} item={item} />
              ))}
            </div>
          )}
          {unclear.length > 0 && (
            <div>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-300/80 bg-amber-500/5">
                Unclear
              </div>
              {unclear.map((item, i) => (
                <ManualCompareRow key={`u-${i}`} item={item} />
              ))}
            </div>
          )}
          {matched.length > 0 && (
            <div>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300/80 bg-emerald-500/5">
                Matched
              </div>
              {matched.map((item, i) => (
                <ManualCompareRow key={`ok-${i}`} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
