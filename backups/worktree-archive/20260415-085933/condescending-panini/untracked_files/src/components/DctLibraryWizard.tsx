/**
 * DctLibraryWizard
 *
 * Guides the user through selecting applicable DCTs from the platform-wide library:
 *  1. Profile check — verify the regulatory profile is complete enough to filter
 *  2. Results — show applicable / uncertain / not-applicable counts + validation
 *  3. Review — page through uncertain DCTs and accept/reject each
 *  4. Ingesting — progress bar while downloading + ingesting selected XMLs
 */
import { useMemo, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiInfo,
  FiLayers,
  FiX,
  FiSliders,
} from 'react-icons/fi';
import {
  runLibraryApplicability,
  type CatalogApplicabilityResult,
  type CatalogEntry,
  type LibraryApplicabilityReport,
} from '../services/dctLibraryApplicability';
import type { RegulatoryProfile } from '../services/dctApplicabilityEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardView = 'profile' | 'results' | 'review' | 'ingesting';

interface IngestProgress {
  done: number;
  total: number;
  skipped: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: RegulatoryProfile | null;
  catalog: CatalogEntry[];
  /** Called with the final selection of entries to download + ingest */
  onApplySelection: (selected: CatalogEntry[]) => void;
  ingestProgress?: IngestProgress | null;
  isIngesting?: boolean;
}

const REVIEW_PAGE_SIZE = 30;

// ── Component ─────────────────────────────────────────────────────────────────

export default function DctLibraryWizard({
  isOpen,
  onClose,
  profile,
  catalog,
  onApplySelection,
  ingestProgress,
  isIngesting,
}: Props) {
  const [view, setView] = useState<WizardView>('profile');
  const [report, setReport] = useState<LibraryApplicabilityReport | null>(null);
  /** entryId → true (accepted) / false (rejected) */
  const [uncertainDecisions, setUncertainDecisions] = useState<Record<string, boolean>>({});
  const [reviewPage, setReviewPage] = useState(0);

  const isProfileComplete = useMemo(() => {
    if (!profile) return false;
    return (
      profile.peerGroup != null ||
      profile.classRatings.length > 0 ||
      profile.opSpecs.filter((s) => s.isActive).length > 0
    );
  }, [profile]);

  function handleRunApplicability() {
    if (!profile) return;
    const r = runLibraryApplicability(profile, catalog);
    setReport(r);
    // Default: accept all uncertain
    const defaults: Record<string, boolean> = {};
    for (const item of r.uncertain) {
      defaults[item.entry._id] = true;
    }
    setUncertainDecisions(defaults);
    setReviewPage(0);
    setView('results');
  }

  function handleApply() {
    if (!report) return;
    const selected: CatalogEntry[] = [
      ...report.applicable.map((r) => r.entry),
      ...report.uncertain
        .filter((r) => uncertainDecisions[r.entry._id] !== false)
        .map((r) => r.entry),
    ];
    onApplySelection(selected);
    setView('ingesting');
  }

  function toggleUncertain(entryId: string) {
    setUncertainDecisions((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  }

  function acceptAllUncertain() {
    if (!report) return;
    const all: Record<string, boolean> = { ...uncertainDecisions };
    for (const item of report.uncertain) all[item.entry._id] = true;
    setUncertainDecisions(all);
  }

  function rejectAllUncertain() {
    if (!report) return;
    const all: Record<string, boolean> = { ...uncertainDecisions };
    for (const item of report.uncertain) all[item.entry._id] = false;
    setUncertainDecisions(all);
  }

  if (!isOpen) return null;

  const progressPct = ingestProgress
    ? Math.round(((ingestProgress.done + ingestProgress.skipped) / Math.max(ingestProgress.total, 1)) * 100)
    : 0;

  const reviewItems = report?.uncertain ?? [];
  const totalReviewPages = Math.ceil(reviewItems.length / REVIEW_PAGE_SIZE);
  const pageSlice = reviewItems.slice(reviewPage * REVIEW_PAGE_SIZE, (reviewPage + 1) * REVIEW_PAGE_SIZE);
  const acceptedCount = report
    ? report.uncertain.filter((r) => uncertainDecisions[r.entry._id] !== false).length
    : 0;
  const totalSelected = (report?.applicable.length ?? 0) + acceptedCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-navy-900/95 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <FiLayers className="text-sky-400 text-lg" />
            <span className="text-white font-semibold text-base">Apply from DCT Library</span>
            <span className="text-white/40 text-sm">
              {catalog.length.toLocaleString()} DCTs in catalog
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <FiX />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.06] shrink-0">
          {(['profile', 'results', 'review'] as WizardView[]).map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              {i > 0 && <div className="w-6 h-px bg-white/20" />}
              <div
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  view === step
                    ? 'bg-sky-500/30 text-sky-300 border border-sky-500/40'
                    : (view === 'results' && step === 'profile') ||
                      (view === 'review' && (step === 'profile' || step === 'results')) ||
                      view === 'ingesting'
                    ? 'bg-white/5 text-white/40'
                    : 'bg-white/5 text-white/30'
                }`}
              >
                {i + 1}. {step === 'profile' ? 'Profile' : step === 'results' ? 'Results' : 'Review'}
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {/* ── VIEW: profile ── */}
          {view === 'profile' && (
            <div className="space-y-4">
              <p className="text-white/70 text-sm leading-relaxed">
                The applicability engine will filter{' '}
                <strong className="text-white">{catalog.length.toLocaleString()} platform DCTs</strong> to
                find the ones that apply to your repair station based on your regulatory profile (peer group,
                class ratings, and active OpSpec paragraphs).
              </p>

              {!profile ? (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <FiAlertTriangle className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-amber-200 text-sm font-medium">No entity profile found</p>
                    <p className="text-amber-200/70 text-xs mt-1">
                      Configure your regulatory profile (class ratings, OpSpecs, peer group) before running
                      the applicability filter.
                    </p>
                  </div>
                </div>
              ) : !isProfileComplete ? (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <FiAlertTriangle className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-amber-200 text-sm font-medium">Profile incomplete</p>
                    <p className="text-amber-200/70 text-xs mt-1">
                      Add class ratings or active OpSpecs for accurate filtering. You can still run the
                      filter — all DCTs will be shown as uncertain.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <FiCheckCircle className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-emerald-200 text-sm font-medium">Profile ready</p>
                    <div className="text-emerald-200/70 text-xs mt-1 space-y-0.5">
                      {profile.peerGroup && <div>Peer Group: <strong className="text-emerald-200">{profile.peerGroup}</strong></div>}
                      {profile.classRatings.length > 0 && (
                        <div>
                          Ratings:{' '}
                          <strong className="text-emerald-200">
                            {[...new Set(profile.classRatings.map((r) => r.category))].join(', ')}
                          </strong>
                        </div>
                      )}
                      {profile.opSpecs.filter((s) => s.isActive).length > 0 && (
                        <div>
                          Active OpSpecs:{' '}
                          <strong className="text-emerald-200">
                            {profile.opSpecs.filter((s) => s.isActive).map((s) => s.paragraph).join(', ')}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                <FiInfo className="text-sky-400 mt-0.5 shrink-0" />
                <p className="text-white/60 text-xs leading-relaxed">
                  Typical Part 145 domestic stations (Peer Group F) have 50–95 applicable DCTs out of 1,300
                  total. The engine will flag borderline DCTs for your review before ingesting anything.
                </p>
              </div>
            </div>
          )}

          {/* ── VIEW: results ── */}
          {view === 'results' && report && (
            <div className="space-y-4">
              {/* Count validation banner */}
              {report.countValidation === 'profile_incomplete' && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <FiAlertTriangle className="text-amber-400 mt-0.5 shrink-0 text-sm" />
                  <p className="text-amber-200 text-xs">
                    Profile is incomplete — most DCTs are shown as uncertain. Complete your regulatory
                    profile for accurate filtering.
                  </p>
                </div>
              )}
              {report.countValidation === 'low' && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <FiAlertTriangle className="text-amber-400 mt-0.5 shrink-0 text-sm" />
                  <p className="text-amber-200 text-xs">
                    Only <strong>{report.applicable.length}</strong> confident matches found — expected{' '}
                    {report.expectedRange.min}–{report.expectedRange.max} for{' '}
                    {report.expectedRange.label}. Review your class ratings and peer group settings.
                  </p>
                </div>
              )}
              {report.countValidation === 'high' && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <FiAlertTriangle className="text-amber-400 mt-0.5 shrink-0 text-sm" />
                  <p className="text-amber-200 text-xs">
                    <strong>{report.applicable.length}</strong> confident matches — higher than expected
                    range of {report.expectedRange.min}–{report.expectedRange.max} for{' '}
                    {report.expectedRange.label}. This is fine if your station has broad ratings.
                  </p>
                </div>
              )}
              {report.countValidation === 'ok' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <FiCheckCircle className="text-emerald-400 text-sm shrink-0" />
                  <p className="text-emerald-200 text-xs">
                    <strong>{report.applicable.length}</strong> applicable DCTs — within expected range for{' '}
                    {report.expectedRange.label}.
                  </p>
                </div>
              )}

              {/* Count cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
                  <div className="text-3xl font-bold text-emerald-300">{report.applicable.length}</div>
                  <div className="text-xs text-emerald-200/70 mt-1">Applicable</div>
                  <div className="text-xs text-emerald-200/40 mt-0.5">confident match</div>
                </div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                  <div className="text-3xl font-bold text-amber-300">{report.uncertain.length}</div>
                  <div className="text-xs text-amber-200/70 mt-1">Uncertain</div>
                  <div className="text-xs text-amber-200/40 mt-0.5">needs review</div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
                  <div className="text-3xl font-bold text-white/40">{report.notApplicable.length}</div>
                  <div className="text-xs text-white/40 mt-1">Not Applicable</div>
                  <div className="text-xs text-white/25 mt-0.5">excluded</div>
                </div>
              </div>

              <p className="text-white/50 text-xs">
                {report.uncertain.length > 0
                  ? `Review ${report.uncertain.length} uncertain DCT${report.uncertain.length !== 1 ? 's' : ''} on the next step. All are pre-accepted — deselect any that don't apply to your operation.`
                  : 'No uncertain DCTs — you can apply the selection directly.'}
              </p>
            </div>
          )}

          {/* ── VIEW: review ── */}
          {view === 'review' && report && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-white/70 text-sm">
                  {report.uncertain.length} DCTs need review. Accept the ones that apply to your operation.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={acceptAllUncertain}
                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                  >
                    Accept all
                  </button>
                  <button
                    onClick={rejectAllUncertain}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    Reject all
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {pageSlice.map((item) => (
                  <UncertainRow
                    key={item.entry._id}
                    item={item}
                    accepted={uncertainDecisions[item.entry._id] !== false}
                    onToggle={() => toggleUncertain(item.entry._id)}
                  />
                ))}
              </div>

              {totalReviewPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    disabled={reviewPage === 0}
                    onClick={() => setReviewPage((p) => p - 1)}
                    className="flex items-center gap-1 text-xs text-white/60 hover:text-white/90 disabled:opacity-30 transition-colors"
                  >
                    <FiChevronLeft /> Prev
                  </button>
                  <span className="text-xs text-white/40">
                    {reviewPage + 1} / {totalReviewPages}
                  </span>
                  <button
                    disabled={reviewPage >= totalReviewPages - 1}
                    onClick={() => setReviewPage((p) => p + 1)}
                    className="flex items-center gap-1 text-xs text-white/60 hover:text-white/90 disabled:opacity-30 transition-colors"
                  >
                    Next <FiChevronRight />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── VIEW: ingesting ── */}
          {view === 'ingesting' && (
            <div className="space-y-4 py-4">
              {isIngesting ? (
                <>
                  <p className="text-white/70 text-sm text-center">
                    Downloading and ingesting {totalSelected} DCTs…
                  </p>
                  {ingestProgress && (
                    <>
                      <div className="flex justify-between text-xs text-white/50 mb-1">
                        <span>
                          {ingestProgress.done + ingestProgress.skipped} / {ingestProgress.total}
                          {ingestProgress.skipped > 0
                            ? ` · ${ingestProgress.skipped} unchanged`
                            : ''}
                        </span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-3">
                        <div
                          className="bg-sky-400 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center space-y-3">
                  <FiCheckCircle className="text-emerald-400 text-4xl mx-auto" />
                  <p className="text-emerald-200 text-sm font-medium">
                    DCT ingestion complete
                  </p>
                  <p className="text-white/50 text-xs">
                    Your traceability matrix now contains the selected DCTs.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 shrink-0">
          <button
            onClick={() => {
              if (view === 'results') setView('profile');
              else if (view === 'review') setView('results');
              else if (view === 'ingesting' && !isIngesting) onClose();
              else onClose();
            }}
            className="text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            {view === 'ingesting' && !isIngesting ? 'Close' : view === 'profile' ? 'Cancel' : '← Back'}
          </button>

          <div className="flex items-center gap-3">
            {view === 'review' && report && (
              <span className="text-xs text-white/40">
                {totalSelected} DCT{totalSelected !== 1 ? 's' : ''} selected
              </span>
            )}
            {view === 'profile' && (
              <button
                onClick={handleRunApplicability}
                disabled={!profile || catalog.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/30 text-sky-200 border border-sky-500/40 text-sm font-medium hover:bg-sky-500/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FiSliders className="text-xs" />
                Run Applicability Filter
              </button>
            )}
            {view === 'results' && report && (
              <button
                onClick={() =>
                  report.uncertain.length > 0 ? setView('review') : handleApply()
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/30 text-sky-200 border border-sky-500/40 text-sm font-medium hover:bg-sky-500/40 transition-colors"
              >
                {report.uncertain.length > 0 ? (
                  <>Review {report.uncertain.length} uncertain <FiChevronRight /></>
                ) : (
                  <>Apply {report.applicable.length} DCTs <FiCheck /></>
                )}
              </button>
            )}
            {view === 'review' && (
              <button
                onClick={handleApply}
                disabled={totalSelected === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-sm font-medium hover:bg-emerald-500/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FiCheck />
                Apply {totalSelected} DCTs
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Uncertain row subcomponent ────────────────────────────────────────────────

function UncertainRow({
  item,
  accepted,
  onToggle,
}: {
  item: CatalogApplicabilityResult;
  accepted: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        accepted
          ? 'bg-emerald-500/8 border-emerald-500/20'
          : 'bg-white/3 border-white/8'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
            accepted
              ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
              : 'bg-white/5 border-white/20 text-transparent'
          }`}
        >
          <FiCheck className="text-xs" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/85 text-xs font-medium truncate">
              {item.entry.fileName}
            </span>
            {item.entry.peerGroupLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/20 shrink-0">
                {item.entry.peerGroupLabel}
              </span>
            )}
            {item.entry.specialtyLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/50 border border-white/10 shrink-0">
                {item.entry.specialtyLabel}
              </span>
            )}
            <span className="text-[10px] text-amber-300/70 shrink-0">
              {Math.round(item.confidence * 100)}% confidence
            </span>
          </div>
          {item.entry.mlfLabel && (
            <div className="text-[11px] text-white/40 mt-0.5 truncate">{item.entry.mlfLabel}</div>
          )}
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-white/30 hover:text-white/60 text-xs shrink-0 transition-colors"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && item.reasons.length > 0 && (
        <div className="mt-2 pl-8 space-y-0.5">
          {item.reasons.map((r, i) => (
            <div key={i} className="text-[11px] text-white/40 flex items-start gap-1.5">
              <span className="text-white/20 mt-0.5">•</span>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
