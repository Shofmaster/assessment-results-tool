import { useState } from 'react';
import { toast } from 'sonner';
import { useUpdateAircraftAsset } from '../../hooks/useConvexData';
import type { AircraftAsset } from '../../types/aircraftAsset';
import type { AircraftType } from '../../types/aircraftType';
import { SaveStatus, useSaveStatus } from '../ui';

const INPUT_CLASS =
  'w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-sky-light focus:outline-none';
const LABEL_CLASS = 'block text-[10px] uppercase tracking-wide text-white/50 mb-1';

const TEXT_FIELDS = [
  ['tailNumber', 'Tail number'],
  ['make', 'Make'],
  ['model', 'Model'],
  ['serial', 'Serial number'],
  ['operator', 'Owner / operator'],
  ['year', 'Year'],
] as const;

type FormState = Record<(typeof TEXT_FIELDS)[number][0] | 'aircraftTypeId', string>;

function toForm(aircraft: AircraftAsset): FormState {
  return {
    tailNumber: aircraft.tailNumber ?? '',
    make: aircraft.make ?? '',
    model: aircraft.model ?? '',
    serial: aircraft.serial ?? '',
    operator: aircraft.operator ?? '',
    year: aircraft.year != null ? String(aircraft.year) : '',
    aircraftTypeId: aircraft.aircraftTypeId ?? '',
  };
}

/**
 * Edits a tail's identity. Until this existed there was no way to correct a
 * make/model/serial after the aircraft was created — the Convex mutation was
 * shipped but never wired to any UI.
 */
export default function AircraftIdentityEditor({
  aircraft,
  aircraftTypes,
}: {
  aircraft: AircraftAsset;
  aircraftTypes: AircraftType[];
}) {
  const updateAircraft = useUpdateAircraftAsset();
  const save = useSaveStatus();
  // Seeded once per mount instead of hydrated by an effect. AircraftDetailPanel
  // keys this editor on the aircraft id + updatedAt, so switching tails or a
  // sync overwriting the record remounts it and reseeds.
  const [form, setForm] = useState<FormState>(() => toForm(aircraft));

  const original = toForm(aircraft);
  const dirty = (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== original[k]);

  const handleSave = async () => {
    if (!form.tailNumber.trim()) {
      toast.error('Tail number is required');
      return;
    }
    if (form.year.trim() && !Number.isFinite(Number(form.year))) {
      toast.error('Year must be a number');
      return;
    }
    await save.run(async () => {
      await updateAircraft({
        aircraftId: aircraft._id as never,
        tailNumber: form.tailNumber.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        serial: form.serial.trim(),
        operator: form.operator.trim(),
        // The mutation drops `undefined` keys, so clearing the year needs a 0-free
        // sentinel; omit it entirely when blank rather than writing NaN.
        ...(form.year.trim() ? { year: Number(form.year) } : {}),
        aircraftTypeId: (form.aircraftTypeId ? form.aircraftTypeId : null) as never,
      });
    });
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="aircraft-type-select">
            Aircraft type
          </label>
          <select
            id="aircraft-type-select"
            value={form.aircraftTypeId}
            onChange={(e) => setForm((f) => ({ ...f, aircraftTypeId: e.target.value }))}
            className={`${INPUT_CLASS} [&>option]:bg-navy-900 [&>option]:text-white`}
          >
            <option value="">— Unassigned —</option>
            {aircraftTypes.map((type) => (
              <option key={type._id} value={type._id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        {TEXT_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className={LABEL_CLASS} htmlFor={`aircraft-${key}`}>
              {label}
            </label>
            <input
              id={`aircraft-${key}`}
              type={key === 'year' ? 'number' : 'text'}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || save.state === 'saving'}
          className="rounded-lg bg-sky/30 px-4 py-2 text-sm font-medium transition-colors hover:bg-sky/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save details
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
    </div>
  );
}
