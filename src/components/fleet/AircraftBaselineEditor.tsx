import { useState } from 'react';
import { toast } from 'sonner';
import { useUpdateAircraftAsset } from '../../hooks/useConvexData';
import type { AircraftAsset } from '../../types/aircraftAsset';
import { SaveStatus, useSaveStatus } from '../ui';
import { formatNumber, relativeTime } from './fleetFormat';

const INPUT_CLASS =
  'w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-sky-light focus:outline-none';
const LABEL_CLASS = 'block text-[10px] uppercase tracking-wide text-white/50 mb-1';

const NUMERIC_FIELDS = [
  ['baselineTotalTime', 'Total time'],
  ['baselineTotalCycles', 'Total cycles'],
  ['baselineTotalLandings', 'Total landings'],
] as const;

type FormState = Record<
  (typeof NUMERIC_FIELDS)[number][0] | 'baselineAsOfDate',
  string
>;

function toForm(aircraft: AircraftAsset): FormState {
  return {
    baselineTotalTime:
      aircraft.baselineTotalTime != null ? String(aircraft.baselineTotalTime) : '',
    baselineTotalCycles:
      aircraft.baselineTotalCycles != null ? String(aircraft.baselineTotalCycles) : '',
    baselineTotalLandings:
      aircraft.baselineTotalLandings != null ? String(aircraft.baselineTotalLandings) : '',
    baselineAsOfDate: aircraft.baselineAsOfDate ?? '',
  };
}

/**
 * Baseline times — the "known good" starting point that logbook entries and
 * forecasts count up from. Shown alongside the read-only current times so it's
 * obvious which number Avianis owns and which one you own.
 */
export default function AircraftBaselineEditor({ aircraft }: { aircraft: AircraftAsset }) {
  const updateAircraft = useUpdateAircraftAsset();
  const save = useSaveStatus();
  const [form, setForm] = useState<FormState>(() => toForm(aircraft));

  // Re-seed when the user switches tails, or when a sync overwrites the record.
  const seedKey = `${aircraft._id}:${aircraft.updatedAt ?? ''}`;
  const [prevSeedKey, setPrevSeedKey] = useState(seedKey);
  if (prevSeedKey !== seedKey) {
    setPrevSeedKey(seedKey);
    setForm(toForm(aircraft));
    save.reset();
  }

  const original = toForm(aircraft);
  const dirty = (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== original[k]);

  const handleSave = async () => {
    const patch: Record<string, number | string> = {};
    for (const [field] of NUMERIC_FIELDS) {
      const trimmed = form[field].trim();
      if (trimmed === '') continue;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error('Baseline times must be non-negative numbers.');
        return;
      }
      patch[field] = parsed;
    }
    if (form.baselineAsOfDate.trim()) patch.baselineAsOfDate = form.baselineAsOfDate.trim();
    await save.run(() => updateAircraft({ aircraftId: aircraft._id as never, ...patch }));
  };

  const currentRows = [
    ['Current total time', aircraft.currentTotalTime],
    ['Current cycles', aircraft.currentTotalCycles],
    ['Current landings', aircraft.currentTotalLandings],
  ] as const;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {NUMERIC_FIELDS.map(([field, label]) => (
          <div key={field}>
            <label className={LABEL_CLASS} htmlFor={`baseline-${field}`}>
              {label}
            </label>
            <input
              id={`baseline-${field}`}
              type="number"
              min="0"
              step="0.1"
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              placeholder="—"
              className={INPUT_CLASS}
            />
          </div>
        ))}
        <div>
          <label className={LABEL_CLASS} htmlFor="baseline-as-of">
            As of date
          </label>
          <input
            id="baseline-as-of"
            type="date"
            value={form.baselineAsOfDate}
            onChange={(e) => setForm((f) => ({ ...f, baselineAsOfDate: e.target.value }))}
            className={`${INPUT_CLASS} [color-scheme:dark]`}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || save.state === 'saving'}
          className="rounded-lg bg-sky/30 px-4 py-2 text-sm font-medium transition-colors hover:bg-sky/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save baseline
        </button>
        {dirty && save.state === 'idle' ? (
          <button
            type="button"
            onClick={() => setForm(toForm(aircraft))}
            className="text-sm text-white/60 hover:text-white"
          >
            Discard changes
          </button>
        ) : null}
        <SaveStatus state={save.state} errorLabel={save.error ?? undefined} />
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/65">
          Current times (from Avianis)
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4">
          {currentRows.map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
              <div className="text-sm font-medium">{formatNumber(value)}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-white/45">
          Last synced: {relativeTime(aircraft.currentAsOfDate)} · read-only, overwritten on each
          Avianis sync.
        </p>
      </div>
    </div>
  );
}
