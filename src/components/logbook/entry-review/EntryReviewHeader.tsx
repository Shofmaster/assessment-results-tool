import { FiBook, FiCheckCircle, FiSliders } from 'react-icons/fi';
import { LOGBOOK_REVIEW_STANDARD_MAP } from '../../../services/logbookReviewPrompt';
import type { LogbookReviewStandard } from '../../../services/logbookReviewPrompt';
import type { PageMode } from './types';
import CompanyContextPopover from './CompanyContextPopover';

const CHIP_LIMIT = 4;

export default function EntryReviewHeader({
  pageMode,
  onPageModeChange,
  standards,
  onOpenStandards,
  showStandardsControls,
  entityProfile,
  rosterPersonnel,
  opSpecs,
  capabilityItems,
  manuals,
  sharedReferenceDocs,
  onInsertManualTitle,
}: {
  pageMode: PageMode;
  onPageModeChange: (mode: PageMode) => void;
  standards: LogbookReviewStandard[];
  onOpenStandards: () => void;
  showStandardsControls: boolean;
  entityProfile: Parameters<typeof CompanyContextPopover>[0]['entityProfile'];
  rosterPersonnel: Parameters<typeof CompanyContextPopover>[0]['rosterPersonnel'];
  opSpecs: Parameters<typeof CompanyContextPopover>[0]['opSpecs'];
  capabilityItems: Parameters<typeof CompanyContextPopover>[0]['capabilityItems'];
  manuals: Parameters<typeof CompanyContextPopover>[0]['manuals'];
  sharedReferenceDocs: Parameters<typeof CompanyContextPopover>[0]['sharedReferenceDocs'];
  onInsertManualTitle?: (title: string, revision?: string) => void;
}) {
  const subtitle =
    pageMode === 'compliance'
      ? 'Paste, upload, or capture a logbook entry — reviewed against your selected standards.'
      : 'Compare a manual section to a log entry and save gaps as findings.';

  const visibleChips = standards.slice(0, CHIP_LIMIT);
  const extraCount = standards.length - CHIP_LIMIT;

  return (
    <header className="flex-shrink-0 sticky top-0 z-30 -mx-2 sm:-mx-3 lg:-mx-4 px-2 sm:px-3 lg:px-4 py-3 mb-3 border-b border-white/10 bg-navy-950/90 backdrop-blur-md space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-display font-bold bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            Entry Review
          </h1>
          <p className="text-white/50 text-xs sm:text-sm mt-0.5 max-w-2xl leading-snug">{subtitle}</p>
        </div>
        <CompanyContextPopover
          entityProfile={entityProfile}
          rosterPersonnel={rosterPersonnel}
          opSpecs={opSpecs}
          capabilityItems={capabilityItems}
          manuals={manuals}
          sharedReferenceDocs={sharedReferenceDocs}
          onInsertManualTitle={onInsertManualTitle}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 p-0.5 bg-white/5 border border-white/10 rounded-lg">
          <button
            type="button"
            onClick={() => onPageModeChange('compliance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              pageMode === 'compliance'
                ? 'bg-sky/20 text-sky-light border border-sky/40'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            <FiCheckCircle className="text-sm" />
            Compliance review
          </button>
          <button
            type="button"
            onClick={() => onPageModeChange('manualCompare')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              pageMode === 'manualCompare'
                ? 'bg-sky/20 text-sky-light border border-sky/40'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            <FiBook className="text-sm" />
            Manual vs log
          </button>
        </div>

        {showStandardsControls && (
          <>
            <div className="hidden sm:flex flex-wrap items-center gap-1.5 min-w-0">
              {visibleChips.map((id) => (
                <span
                  key={id}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded border border-sky/40 bg-sky/15 text-sky-light"
                >
                  {LOGBOOK_REVIEW_STANDARD_MAP[id]?.shortLabel ?? id}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/60">
                  +{extraCount} more
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenStandards}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
            >
              <FiSliders className="text-sm" />
              Customize standards
              <span className="text-white/40">({standards.length})</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
