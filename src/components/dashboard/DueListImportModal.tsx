import { useMemo, useState, type ChangeEvent } from 'react';
import { useMutation } from 'convex/react';
import { FiUpload, FiX } from 'react-icons/fi';
import { api } from '../../../convex/_generated/api';
import { parseCSV, type ParsedCSV } from '../../services/csvImporter';
import {
  autoDetectDueListMapping,
  buildDueListPreview,
  detectDueListProvider,
  dueListMappingIssues,
  dueListProviderLabel,
  normalizeTailNumber,
  type DueListColumnMapping,
  type DueListField,
  type DueListProvider,
} from '../../services/dueListImporter';

const FIELD_LABELS: Record<DueListField, string> = {
  tailNumber: 'Tail number',
  title: 'Item / task description',
  ataChapter: 'ATA chapter',
  intervalText: 'Interval',
  lastDoneDate: 'Last done — date',
  lastDoneHours: 'Last done — hours',
  lastDoneCycles: 'Last done — cycles',
  nextDueDate: 'Next due — date',
  nextDueHours: 'Next due — hours',
  nextDueCycles: 'Next due — cycles',
  remainingText: 'Remaining (text)',
};

interface ProjectAircraft {
  _id: string;
  tailNumber: string;
}

/**
 * Upload a CAMP/Veryon due-list report (CSV) and store it as the external
 * snapshot for reconciliation. Unmatched tail numbers are listed and skipped —
 * never guessed. XLS exports must be saved as CSV first (noted in the UI).
 */
export default function DueListImportModal({
  projectId,
  aircraft,
  isDarkMode,
  onClose,
  onImported,
}: {
  projectId: string;
  aircraft: ProjectAircraft[];
  isDarkMode: boolean;
  onClose: () => void;
  onImported: (result: { inserted: number; provider: DueListProvider }) => void;
}) {
  const replaceForProvider = useMutation(api.externalDueItems.replaceForProvider);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState('');
  const [provider, setProvider] = useState<DueListProvider>('generic');
  const [mapping, setMapping] = useState<DueListColumnMapping | null>(null);
  const [reportAsOfDate, setReportAsOfDate] = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const aircraftByTail = useMemo(
    () => new Map(aircraft.map((a) => [normalizeTailNumber(a.tailNumber), a._id])),
    [aircraft],
  );

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const result = parseCSV(text);
      if (result.headers.length === 0 || result.rows.length === 0) {
        setError('The file has no parseable rows. If this is an Excel export, save it as CSV first.');
        return;
      }
      const detected = detectDueListProvider(result.headers);
      setParsed(result);
      setFileName(file.name);
      setProvider(detected);
      setMapping(autoDetectDueListMapping(result.headers, detected));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file.');
    }
  };

  const preview = useMemo(() => {
    if (!parsed || !mapping) return null;
    const rows = buildDueListPreview(parsed.rows, parsed.headers, mapping);
    const valid = rows.filter((r) => r.mapped !== null);
    const matched = valid.filter((r) => aircraftByTail.has(r.mapped!.tailNumber));
    const unmatchedTails = [
      ...new Set(
        valid
          .filter((r) => !aircraftByTail.has(r.mapped!.tailNumber))
          .map((r) => r.mapped!.tailNumber),
      ),
    ];
    const warningCount = rows.reduce((acc, r) => acc + r.warnings.length, 0);
    return { rows, valid, matched, unmatchedTails, warningCount };
  }, [parsed, mapping, aircraftByTail]);

  const mappingIssues = mapping ? dueListMappingIssues(mapping) : [];
  const canImport = Boolean(preview && preview.matched.length > 0 && mappingIssues.length === 0 && !importing);

  const handleImport = async () => {
    if (!preview || !canImport) return;
    setImporting(true);
    setError(null);
    try {
      const items = preview.matched.map((r) => {
        const m = r.mapped!;
        return {
          aircraftId: aircraftByTail.get(m.tailNumber)! as never,
          title: m.title,
          ataChapter: m.ataChapter,
          intervalText: m.intervalText,
          lastDoneDate: m.lastDoneDate,
          lastDoneHours: m.lastDoneHours,
          lastDoneCycles: m.lastDoneCycles,
          nextDueDate: m.nextDueDate,
          nextDueHours: m.nextDueHours,
          nextDueCycles: m.nextDueCycles,
          remainingText: m.remainingText,
        };
      });
      const result = (await replaceForProvider({
        projectId: projectId as never,
        provider,
        reportAsOfDate: reportAsOfDate || undefined,
        items,
      })) as { inserted: number };
      onImported({ inserted: result.inserted, provider });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const panelClass = isDarkMode
    ? 'border-white/15 bg-navy-900 text-white'
    : 'border-slate-200 bg-white text-slate-900 shadow-2xl';
  const mutedClass = isDarkMode ? 'text-white/60' : 'text-slate-500';
  const inputClass = isDarkMode
    ? 'rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm focus:border-sky-light focus:outline-none'
    : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none';
  const buttonClass = isDarkMode
    ? 'border-white/20 bg-white/5 text-white/90 hover:bg-white/10'
    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Import tracker due-list report"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-current/10 px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Import tracker due list</p>
            <p className={`mt-0.5 text-xs ${mutedClass}`}>
              Export the due-list report from CAMP or Veryon as CSV, then upload it here. Re-importing
              replaces the previous snapshot for that tracker.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className={`rounded-lg p-1.5 transition-colors ${
              isDarkMode ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm ${buttonClass}`}>
            <FiUpload aria-hidden />
            <span>{fileName || 'Choose a .csv due-list export…'}</span>
            <input type="file" accept=".csv,.tsv,text/csv" className="hidden" onChange={handleFile} />
          </label>

          {error ? <p className={isDarkMode ? 'text-sm text-rose-200' : 'text-sm text-rose-700'}>{error}</p> : null}

          {parsed && mapping ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <span className={mutedClass}>Tracker:</span>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const next = e.target.value as DueListProvider;
                      setProvider(next);
                      setMapping(autoDetectDueListMapping(parsed.headers, next));
                    }}
                    className={inputClass}
                  >
                    <option value="camp">CAMP</option>
                    <option value="veryon">Veryon</option>
                    <option value="generic">Other / generic</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className={mutedClass}>Report as of:</span>
                  <input
                    type="date"
                    value={reportAsOfDate}
                    onChange={(e) => setReportAsOfDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowMapping((p) => !p)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${buttonClass}`}
                >
                  {showMapping ? 'Hide column mapping' : 'Adjust column mapping'}
                </button>
              </div>

              <p className={`text-xs ${mutedClass}`}>
                Detected as {dueListProviderLabel(detectDueListProvider(parsed.headers))} ·{' '}
                {parsed.rows.length} rows
              </p>

              {mappingIssues.length > 0 ? (
                <div className={`rounded-lg border px-3 py-2 text-xs ${
                  isDarkMode ? 'border-amber-300/30 bg-amber-500/10 text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}>
                  {mappingIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                  <p className="mt-1">Use “Adjust column mapping” to pick the right columns.</p>
                </div>
              ) : null}

              {showMapping ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(FIELD_LABELS) as DueListField[]).map((field) => (
                    <label key={field} className="flex items-center justify-between gap-2 text-xs">
                      <span className={mutedClass}>{FIELD_LABELS[field]}</span>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) =>
                          setMapping((prev) => (prev ? { ...prev, [field]: e.target.value || null } : prev))
                        }
                        className={`${inputClass} max-w-[55%]`}
                      >
                        <option value="">— not mapped —</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}

              {preview ? (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-semibold">{preview.matched.length}</span> rows match your fleet
                    {preview.valid.length !== preview.rows.length ? (
                      <span className={mutedClass}> · {preview.rows.length - preview.valid.length} skipped (missing tail/title)</span>
                    ) : null}
                    {preview.warningCount > 0 ? (
                      <span className={mutedClass}> · {preview.warningCount} field warnings</span>
                    ) : null}
                  </p>
                  {preview.unmatchedTails.length > 0 ? (
                    <p className={`text-xs ${isDarkMode ? 'text-amber-200/90' : 'text-amber-700'}`}>
                      Skipping unknown tails (not in this project): {preview.unmatchedTails.join(', ')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-current/10 px-5 py-3">
          <button type="button" onClick={onClose} className={`rounded-lg border px-4 py-2 text-sm font-medium ${buttonClass}`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="rounded-lg bg-sky/30 px-4 py-2 text-sm font-semibold transition-colors hover:bg-sky/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${preview?.matched.length ?? 0} items`}
          </button>
        </div>
      </div>
    </div>
  );
}
