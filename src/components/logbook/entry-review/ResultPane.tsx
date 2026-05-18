import { FiAlertCircle, FiLoader } from 'react-icons/fi';
import { LOGBOOK_REVIEW_STANDARD_MAP, type LogbookReviewStandard } from '../../../services/logbookReviewPrompt';
import type { ManualComparisonResult } from '../../../services/manualLogbookComparison';
import ManualCompareResultPanel from './ManualCompareResultPanel';
import ReviewResultPanel from './ReviewResultPanel';
import type { PageMode, SmartReviewResult } from './types';

export default function ResultPane({
  pageMode,
  standards,
  loading,
  loadingMessage,
  error,
  complianceResult,
  manualResult,
  onDismissCompliance,
  onDismissManual,
  onSaveManualGaps,
  canSaveManualGaps,
  savingManualGaps,
  mobileTab,
}: {
  pageMode: PageMode;
  standards: LogbookReviewStandard[];
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  complianceResult: SmartReviewResult | null;
  manualResult: ManualComparisonResult | null;
  onDismissCompliance: () => void;
  onDismissManual: () => void;
  onSaveManualGaps: () => void;
  canSaveManualGaps: boolean;
  savingManualGaps: boolean;
  mobileTab?: 'input' | 'results';
}) {
  const hiddenOnMobile = mobileTab === 'input' ? 'hidden lg:flex' : 'flex';

  const hasResult =
    pageMode === 'compliance' ? !!complianceResult : !!manualResult;
  const showEmpty = !loading && !error && !hasResult;

  return (
    <div
      className={`${hiddenOnMobile} flex-col min-h-0 lg:w-[42%] lg:flex-shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden`}
    >
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Results</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-sky/20 bg-sky/10 text-sm text-sky-light/80">
            <FiLoader className="animate-spin flex-shrink-0" />
            {loadingMessage}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <FiAlertCircle className="flex-shrink-0" />
            {error}
          </div>
        )}

        {pageMode === 'compliance' && complianceResult && !loading && (
          <ReviewResultPanel result={complianceResult} onDismiss={onDismissCompliance} />
        )}

        {pageMode === 'manualCompare' && manualResult && !loading && (
          <ManualCompareResultPanel
            result={manualResult}
            onDismiss={onDismissManual}
            onSaveGaps={onSaveManualGaps}
            canSaveGaps={canSaveManualGaps}
            savingGaps={savingManualGaps}
          />
        )}

        {showEmpty && pageMode === 'compliance' && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2">
            <p className="text-sm font-semibold text-white/60">
              What gets checked ({standards.length} standard{standards.length === 1 ? '' : 's'})
            </p>
            <ul className="space-y-1 text-xs text-white/40 list-disc list-inside">
              {standards.map((id) => {
                const meta = LOGBOOK_REVIEW_STANDARD_MAP[id];
                if (!meta) return null;
                return (
                  <li key={id}>
                    <span className="text-white/70 font-medium">{meta.shortLabel}</span>
                    <span className="text-white/40"> — {meta.label}</span>
                  </li>
                );
              })}
              <li>Cross-checks against company roster, capability list, and OpSpec scope</li>
            </ul>
          </div>
        )}

        {showEmpty && pageMode === 'manualCompare' && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2">
            <p className="text-sm font-semibold text-white/60">How manual comparison works</p>
            <ul className="space-y-1 text-xs text-white/40 list-disc list-inside">
              <li>Paste or upload the manual section for your inspection type.</li>
              <li>Use the same label as in your program (e.g. &quot;96/144&quot;, &quot;12-month&quot;).</li>
              <li>The app extracts required items and checks the log entry against each one.</li>
              <li>Save missing or unclear items as Compliance findings (Logbook → Compliance).</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
