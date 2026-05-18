import { FiX } from 'react-icons/fi';
import {
  LOGBOOK_REVIEW_PRESETS,
  LOGBOOK_REVIEW_REGIONS,
  LOGBOOK_REVIEW_STANDARD_MAP,
  type LogbookReviewStandard,
} from '../../../services/logbookReviewPrompt';
import { standardsByRegion } from './reviewClient';

export default function StandardsDrawer({
  open,
  onClose,
  standards,
  onToggleStandard,
  onApplyPreset,
}: {
  open: boolean;
  onClose: () => void;
  standards: LogbookReviewStandard[];
  onToggleStandard: (id: LogbookReviewStandard) => void;
  onApplyPreset: (ids: LogbookReviewStandard[]) => void;
}) {
  if (!open) return null;

  const regionGroups = standardsByRegion();

  return (
    <>
      <button
        type="button"
        aria-label="Close standards panel"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg flex flex-col border-l border-white/10 bg-navy-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white/85">Applicable standards</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10"
          >
            <FiX />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-white/40 w-full">Quick presets</p>
            <div className="flex flex-wrap gap-1.5">
              {LOGBOOK_REVIEW_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset.standards)}
                  title={preset.description}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium border border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onApplyPreset(['part_43_general'])}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium border border-white/15 bg-white/5 text-white/55 hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {LOGBOOK_REVIEW_REGIONS.map((region) => {
              const rows = regionGroups[region.id] ?? [];
              if (!rows.length) return null;
              return (
                <div key={region.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">{region.label}</p>
                  <div className="space-y-1">
                    {rows.map((meta) => {
                      const checked = standards.includes(meta.id);
                      return (
                        <label
                          key={meta.id}
                          className="flex items-start gap-2 text-xs text-white/70 cursor-pointer hover:text-white/90"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleStandard(meta.id)}
                            className="mt-0.5 rounded border-white/20 bg-white/10"
                          />
                          <span className="flex flex-col">
                            <span className="font-medium text-white/85">{meta.shortLabel}</span>
                            <span className="text-[10px] text-white/45 leading-tight">{meta.label}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-white/35">
            {standards.length} selected:{' '}
            {standards.map((id) => LOGBOOK_REVIEW_STANDARD_MAP[id]?.shortLabel ?? id).join(', ')}
          </p>
        </div>
        <div className="flex-shrink-0 p-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30"
          >
            Done
          </button>
        </div>
      </aside>
    </>
  );
}
