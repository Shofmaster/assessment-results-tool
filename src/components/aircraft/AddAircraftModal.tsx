import { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { fetchFaaRegistryViaApi, parseTailForFaaQuery } from '../../services/faaRegistryLookup';
import type { useCreateAircraftAsset } from '../../hooks/useConvexData';
import type { AircraftType } from '../../types/aircraftType';
import { PANEL_TONES, type PanelTone } from './aircraftPanelTone';

/** Fields the user fills in; everything but the tail number is optional. */
const TEXT_FIELDS = [
  ['tailNumber', 'Tail Number *'],
  ['make', 'Make (e.g. Cessna)'],
  ['model', 'Model (e.g. 172S)'],
  ['serial', 'Serial Number'],
  ['operator', 'Registered owner / operator'],
  ['year', 'Year manufactured'],
] as const;

/**
 * Add-aircraft modal, shared by Logbook Management and the Fleet page. Typing a
 * U.S. N-number debounce-queries the FAA registry and fills empty fields.
 */
export default function AddAircraftModal({
  projectId,
  aircraftTypes,
  onCreate,
  onClose,
  onCreated,
  tone = 'paper',
}: {
  projectId: string;
  aircraftTypes: AircraftType[];
  onCreate: ReturnType<typeof useCreateAircraftAsset>;
  onClose: () => void;
  onCreated: (id: string) => void;
  tone?: PanelTone;
}) {
  const t = PANEL_TONES[tone];
  const [form, setForm] = useState({
    tailNumber: '',
    make: '',
    model: '',
    serial: '',
    operator: '',
    year: '',
    aircraftTypeId: '',
  });
  const [saving, setSaving] = useState(false);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryHint, setRegistryHint] = useState<string | null>(null);
  const lookupGen = useRef(0);

  useEffect(() => {
    const tail = form.tailNumber;
    const parsed = parseTailForFaaQuery(tail);
    if (!parsed || parsed.query.length < 3) {
      setRegistryHint(null);
      setRegistryLoading(false);
      return;
    }

    const gen = ++lookupGen.current;
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setRegistryLoading(true);
      setRegistryHint(null);
      try {
        const data = await fetchFaaRegistryViaApi(tail, ac.signal);
        if (gen !== lookupGen.current) return;
        if (!data) {
          setRegistryHint('No FAA registry match for this N-number. Enter details manually.');
          return;
        }
        setForm((f) => ({
          ...f,
          tailNumber: data.tailNumber,
          make: f.make.trim() ? f.make : (data.make ?? ''),
          model: f.model.trim() ? f.model : (data.model ?? ''),
          serial: f.serial.trim() ? f.serial : (data.serial ?? ''),
          operator: f.operator.trim() ? f.operator : (data.operator ?? ''),
          year: f.year.trim() ? f.year : (data.year != null ? String(data.year) : ''),
        }));
        setRegistryHint('Loaded from FAA Civil Aircraft Registry — you can edit any field.');
      } catch (e: unknown) {
        if (gen !== lookupGen.current) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setRegistryHint(e instanceof Error ? e.message : 'Lookup failed');
      } finally {
        if (gen === lookupGen.current) setRegistryLoading(false);
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [form.tailNumber]);

  const handleSave = async () => {
    if (!form.tailNumber.trim()) {
      toast.error('Tail number is required');
      return;
    }
    setSaving(true);
    try {
      const id = await onCreate({
        projectId: projectId as never,
        tailNumber: form.tailNumber.trim(),
        aircraftTypeId: form.aircraftTypeId ? (form.aircraftTypeId as never) : undefined,
        make: form.make || undefined,
        model: form.model || undefined,
        serial: form.serial || undefined,
        operator: form.operator || undefined,
        year: form.year ? Number(form.year) : undefined,
      });
      toast.success(`Aircraft ${form.tailNumber} added`);
      onCreated(String(id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add aircraft');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${t.shell} w-full max-w-md p-6 max-h-[85vh] overflow-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={t.modalHeading}>Add Aircraft</h2>
          <button type="button" onClick={onClose} className={t.closeButton} aria-label="Close">
            <FiX />
          </button>
        </div>
        <div className="space-y-3">
          <p className={`${t.description} leading-relaxed`}>
            Enter a U.S. N-number — we query the{' '}
            <a
              href="https://registry.faa.gov/AircraftInquiry/Search/NNumberInquiry"
              target="_blank"
              rel="noreferrer"
              className={t.link}
            >
              FAA Civil Aircraft Registry
            </a>{' '}
            and fill empty fields. Everything stays editable.
          </p>
          {(registryLoading || registryHint) && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                registryLoading ? t.hintLoading : t.hintIdle
              }`}
            >
              {registryLoading ? 'Looking up FAA registry…' : registryHint}
            </div>
          )}
          <div>
            <label className={t.label} htmlFor="add-aircraft-type">
              Aircraft type
            </label>
            <select
              id="add-aircraft-type"
              value={form.aircraftTypeId}
              onChange={(e) => setForm((f) => ({ ...f, aircraftTypeId: e.target.value }))}
              className={t.select}
            >
              <option value="">— Unassigned —</option>
              {aircraftTypes.map((type) => (
                <option key={type._id} value={type._id}>
                  {type.name}
                </option>
              ))}
            </select>
            {aircraftTypes.length === 0 ? (
              <p className={t.subtleNote}>No types defined yet — you can assign one later.</p>
            ) : null}
          </div>
          {TEXT_FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className={t.label} htmlFor={`add-aircraft-${key}`}>
                {label}
              </label>
              <input
                id={`add-aircraft-${key}`}
                type={key === 'year' ? 'number' : 'text'}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className={t.input}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className={t.cancelButton}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className={t.primaryButton}>
            {saving ? 'Adding...' : 'Add Aircraft'}
          </button>
        </div>
      </div>
    </div>
  );
}
