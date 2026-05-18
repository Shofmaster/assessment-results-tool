import { useRef } from 'react';
import { FiBook, FiLoader, FiUpload, FiScissors } from 'react-icons/fi';

type AircraftOption = { _id: string; tailNumber?: string; registration?: string };
type EntryOption = { _id: string; entryDate?: string; workPerformed?: string; rawText?: string };

export default function ManualComparePanel({
  activeProjectId,
  aircraftList,
  logbookEnabled,
  inspectionType,
  onInspectionTypeChange,
  manualText,
  onManualTextChange,
  compareLogText,
  onCompareLogTextChange,
  selectedCompareLog,
  onSelectedCompareLogChange,
  selectedAircraftId,
  onAircraftChange,
  optionalEntryId,
  onOptionalEntryChange,
  recentEntries,
  extractingManual,
  comparingManual,
  onManualFileUpload,
  onCompare,
}: {
  activeProjectId: string | null;
  aircraftList: AircraftOption[];
  logbookEnabled: boolean;
  inspectionType: string;
  onInspectionTypeChange: (v: string) => void;
  manualText: string;
  onManualTextChange: (v: string) => void;
  compareLogText: string;
  onCompareLogTextChange: (v: string) => void;
  selectedCompareLog: string;
  onSelectedCompareLogChange: (selection: string) => void;
  selectedAircraftId: string;
  onAircraftChange: (id: string) => void;
  optionalEntryId: string;
  onOptionalEntryChange: (id: string) => void;
  recentEntries: EntryOption[];
  extractingManual: boolean;
  comparingManual: boolean;
  onManualFileUpload: (file: File) => void;
  onCompare: () => void;
}) {
  const manualFileRef = useRef<HTMLInputElement>(null);
  const compareLogRef = useRef<HTMLTextAreaElement>(null);

  const handleLogSelect = () => {
    const ta = compareLogRef.current;
    if (!ta) return;
    onSelectedCompareLogChange(ta.value.slice(ta.selectionStart, ta.selectionEnd).trim());
  };

  const logSrc = (selectedCompareLog || compareLogText).trim();
  const canCompare =
    !comparingManual && !extractingManual && inspectionType.trim() && manualText.trim() && logSrc;

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {!activeProjectId && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          Select a project so findings can be saved to the right place.
        </div>
      )}
      {activeProjectId && aircraftList.length === 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          No aircraft in this project. Add an aircraft under Logbook first to save findings.
        </div>
      )}
      {!logbookEnabled && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/50">
          Logbook Compliance is not enabled — you can still run comparisons, but saving findings requires Logbook access.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 flex-1 min-h-0">
        <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden min-h-[180px]">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.03] text-xs text-white/40">
            <FiBook className="text-sky-light/70" />
            <span className="flex-1">Manual — paste or upload PDF / Word</span>
            <button
              type="button"
              onClick={() => manualFileRef.current?.click()}
              disabled={extractingManual || comparingManual}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40"
            >
              {extractingManual ? <FiLoader className="animate-spin" /> : <FiUpload />}
              Upload
            </button>
            <input
              ref={manualFileRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onManualFileUpload(f);
              }}
            />
          </div>
          <textarea
            value={manualText}
            onChange={(e) => onManualTextChange(e.target.value)}
            placeholder="Paste the relevant CMP / inspection program section…"
            className="w-full flex-1 min-h-[140px] resize-y p-4 text-sm text-white/85 placeholder:text-white/20 bg-transparent focus:outline-none font-mono leading-relaxed"
          />
        </div>

        <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden min-h-[180px]">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.03] text-xs text-white/40">
            <FiScissors className="text-sky-light/70" />
            <span>
              Log entry — <strong className="text-white/60">select text</strong> for one entry, or compare all
            </span>
          </div>
          <textarea
            ref={compareLogRef}
            value={compareLogText}
            onChange={(e) => onCompareLogTextChange(e.target.value)}
            onSelect={handleLogSelect}
            onMouseUp={handleLogSelect}
            onKeyUp={handleLogSelect}
            placeholder="Paste the maintenance log entry to compare…"
            className="w-full flex-1 min-h-[140px] resize-y p-4 text-sm text-white/85 placeholder:text-white/20 bg-transparent focus:outline-none font-mono leading-relaxed"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-end flex-shrink-0">
        <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Inspection type</span>
          <input
            type="text"
            value={inspectionType}
            onChange={(e) => onInspectionTypeChange(e.target.value)}
            placeholder="e.g. 96/144, 12-month, Phase A"
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-sky/50"
          />
        </label>
        {activeProjectId && aircraftList.length > 0 && (
          <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Aircraft (for findings)</span>
            <select
              value={selectedAircraftId}
              onChange={(e) => onAircraftChange(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-sky/50"
            >
              {aircraftList.map((a) => (
                <option key={a._id} value={String(a._id)} className="bg-navy-900">
                  {a.tailNumber || a.registration || a._id}
                </option>
              ))}
            </select>
          </label>
        )}
        {recentEntries.length > 0 && (
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Link to entry (optional)</span>
            <select
              value={optionalEntryId}
              onChange={(e) => onOptionalEntryChange(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-sky/50"
            >
              <option value="" className="bg-navy-900">
                — None —
              </option>
              {recentEntries.map((e) => (
                <option key={e._id} value={String(e._id)} className="bg-navy-900">
                  {(e.entryDate ?? '?')} — {(e.workPerformed || e.rawText || '').slice(0, 48)}
                  {(e.workPerformed || e.rawText || '').length > 48 ? '…' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <button
          type="button"
          disabled={!canCompare}
          onClick={onCompare}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {comparingManual ? <FiLoader className="animate-spin" /> : <FiBook />}
          {comparingManual ? 'Analyzing…' : 'Compare manual to log'}
        </button>
        {selectedCompareLog && (
          <span className="text-xs text-white/40">Using selection ({selectedCompareLog.length} chars)</span>
        )}
      </div>
    </div>
  );
}
