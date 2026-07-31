import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { AircraftAsset } from '../../types/aircraftAsset';
import { deriveDailyRates, type DueUnit } from '../../utils/dueForecast';

const RATE_FIELDS: Array<{
  unit: DueUnit;
  field: 'estDailyHours' | 'estDailyCycles' | 'estDailyLandings';
  label: string;
  suffix: string;
}> = [
  { unit: 'hours', field: 'estDailyHours', label: 'Hours / day', suffix: 'hr' },
  { unit: 'cycles', field: 'estDailyCycles', label: 'Cycles / day', suffix: 'cyc' },
  { unit: 'landings', field: 'estDailyLandings', label: 'Landings / day', suffix: 'ldg' },
];

/**
 * Manual daily-utilization overrides for due-list forecasting. Shows the
 * Avianis-derived rate when one exists so users can see which rate the
 * forecast actually uses (a derived rate over a >=30-day window wins).
 */
export default function UtilizationRatesEditor({ aircraft }: { aircraft: AircraftAsset }) {
  const setRates = useMutation(api.dueForecast.setEstimatedDailyRates);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rates = useMemo(
    () => deriveDailyRates({ aircraftId: aircraft._id, ...aircraft }, new Date()),
    [aircraft],
  );

  const draftFor = (field: string, stored: number | undefined): string =>
    drafts[field] !== undefined ? drafts[field] : stored !== undefined ? String(stored) : '';

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, number | null> = {};
      for (const { field } of RATE_FIELDS) {
        if (drafts[field] === undefined) continue;
        const trimmed = drafts[field].trim();
        if (trimmed === '') {
          payload[field] = null; // clear the override
        } else {
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            setMessage(
              `Enter a positive number for ${field.replace('estDaily', '').toLowerCase()} (or leave blank).`,
            );
            setSaving(false);
            return;
          }
          payload[field] = parsed;
        }
      }
      if (Object.keys(payload).length === 0) {
        setMessage('No changes to save.');
        setSaving(false);
        return;
      }
      await setRates({ aircraftId: aircraft._id as never, ...payload });
      setDrafts({});
      setMessage('Utilization rates saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save rates.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-white/55">
        Used to project hours/cycles items into calendar days. Leave blank to rely on
        Avianis-derived rates.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {RATE_FIELDS.map(({ unit, field, label, suffix }) => {
          const derived = rates[unit];
          return (
            <label key={field} className="block">
              <span className="text-[10px] uppercase tracking-wide text-white/50">{label}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftFor(field, aircraft[field])}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm focus:border-sky-light focus:outline-none"
              />
              <span className="mt-1 block text-[10px] text-white/45">
                {derived?.source === 'derived'
                  ? `Derived from Avianis: ${derived.perDay.toFixed(2)} ${suffix}/day over ${derived.windowDays} days`
                  : derived?.source === 'manual'
                    ? `Using manual rate: ${derived.perDay.toFixed(2)} ${suffix}/day`
                    : 'No rate available yet'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky/30 px-4 py-2 text-sm font-medium transition-colors hover:bg-sky/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save rates'}
        </button>
        {message ? <span className="text-xs text-white/60">{message}</span> : null}
      </div>
    </div>
  );
}
