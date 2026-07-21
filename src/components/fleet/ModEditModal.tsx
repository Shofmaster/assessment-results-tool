import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, GlassModal, Input, Select } from '../ui';
import {
  ALL_MOD_TYPES,
  MOD_TYPE_LABELS,
  type AircraftModification,
  type IcaRequirement,
  type ModType,
  type RecurringInspection,
} from '../../types/aircraftModification';
import {
  useAddAircraftModifications,
  useUpdateAircraftModification,
} from '../../hooks/useConvexData';

interface ModEditModalProps {
  open: boolean;
  aircraftId: string;
  /** When set, the modal edits this mod; otherwise it creates a new one. */
  mod?: AircraftModification | null;
  onClose: () => void;
}

interface DraftState {
  modType: ModType;
  title: string;
  approvalRef: string;
  holder: string;
  dateInstalled: string;
  description: string;
  ataChapters: string;
  affectedSystems: string;
  status: string;
  icaRequirements: IcaRequirement[];
  afmsRequired: boolean;
  afmsReference: string;
  afmsLimitations: string;
  weightChangeLbs: string;
  arm: string;
  momentChange: string;
  weightNotes: string;
  placards: string;
  electricalLoadNotes: string;
  recurringInspections: RecurringInspection[];
}

const emptyDraft: DraftState = {
  modType: 'stc',
  title: '',
  approvalRef: '',
  holder: '',
  dateInstalled: '',
  description: '',
  ataChapters: '',
  affectedSystems: '',
  status: 'installed',
  icaRequirements: [],
  afmsRequired: false,
  afmsReference: '',
  afmsLimitations: '',
  weightChangeLbs: '',
  arm: '',
  momentChange: '',
  weightNotes: '',
  placards: '',
  electricalLoadNotes: '',
  recurringInspections: [],
};

function draftFromMod(mod: AircraftModification): DraftState {
  return {
    modType: mod.modType,
    title: mod.title,
    approvalRef: mod.approvalRef ?? '',
    holder: mod.holder ?? '',
    dateInstalled: mod.dateInstalled ?? '',
    description: mod.description ?? '',
    ataChapters: (mod.ataChapters ?? []).join(', '),
    affectedSystems: (mod.affectedSystems ?? []).join(', '),
    status: mod.status,
    icaRequirements: (mod.icaRequirements ?? []).map((i) => ({ ...i })),
    afmsRequired: mod.afmSupplement?.required ?? false,
    afmsReference: mod.afmSupplement?.reference ?? '',
    afmsLimitations: (mod.afmSupplement?.limitations ?? []).join('\n'),
    weightChangeLbs: mod.weightBalance?.weightChangeLbs?.toString() ?? '',
    arm: mod.weightBalance?.arm?.toString() ?? '',
    momentChange: mod.weightBalance?.momentChange?.toString() ?? '',
    weightNotes: mod.weightBalance?.notes ?? '',
    placards: (mod.placards ?? []).join('\n'),
    electricalLoadNotes: mod.electricalLoadNotes ?? '',
    recurringInspections: (mod.recurringInspections ?? []).map((i) => ({ ...i })),
  };
}

function parseList(raw: string, separator: RegExp): string[] {
  return raw
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

const textareaClass =
  'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-light transition-colors';

export function ModEditModal({ open, aircraftId, mod, onClose }: ModEditModalProps) {
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const addBatch = useAddAircraftModifications();
  const updateMod = useUpdateAircraftModification();

  useEffect(() => {
    if (open) setDraft(mod ? draftFromMod(mod) : emptyDraft);
  }, [open, mod]);

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const buildFields = () => {
    const hasWb =
      draft.weightChangeLbs.trim() || draft.arm.trim() || draft.momentChange.trim() || draft.weightNotes.trim();
    return {
      modType: draft.modType,
      title: draft.title.trim(),
      approvalRef: draft.approvalRef.trim() || undefined,
      holder: draft.holder.trim() || undefined,
      dateInstalled: draft.dateInstalled || undefined,
      description: draft.description.trim() || undefined,
      ataChapters: parseList(draft.ataChapters, /[,;]/),
      affectedSystems: parseList(draft.affectedSystems, /[,;]/),
      status: draft.status,
      icaRequirements: draft.icaRequirements.filter((i) => i.description.trim()),
      afmSupplement:
        draft.afmsRequired || draft.afmsReference.trim() || draft.afmsLimitations.trim()
          ? {
              required: draft.afmsRequired,
              reference: draft.afmsReference.trim() || undefined,
              limitations: parseList(draft.afmsLimitations, /\n/),
            }
          : undefined,
      weightBalance: hasWb
        ? {
            weightChangeLbs: parseNumber(draft.weightChangeLbs),
            arm: parseNumber(draft.arm),
            momentChange: parseNumber(draft.momentChange),
            notes: draft.weightNotes.trim() || undefined,
          }
        : undefined,
      placards: parseList(draft.placards, /\n/),
      electricalLoadNotes: draft.electricalLoadNotes.trim() || undefined,
      recurringInspections: draft.recurringInspections.filter((i) => i.description.trim()),
    };
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      toast.error('A title is required');
      return;
    }
    setSaving(true);
    try {
      const fields = buildFields();
      if (mod) {
        await updateMod({
          modId: mod._id as any,
          ...fields,
          // null clears optional scalars that were emptied
          approvalRef: fields.approvalRef ?? null,
          holder: fields.holder ?? null,
          dateInstalled: fields.dateInstalled ?? null,
          description: fields.description ?? null,
          afmSupplement: fields.afmSupplement ?? null,
          weightBalance: fields.weightBalance ?? null,
          electricalLoadNotes: fields.electricalLoadNotes ?? null,
        });
        toast.success('Modification updated');
      } else {
        await addBatch({
          aircraftId: aircraftId as any,
          modifications: [{ ...fields, userVerified: true }],
          edges: [],
        });
        toast.success('Modification added');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save modification');
    } finally {
      setSaving(false);
    }
  };

  const updateRepeatable = <T extends IcaRequirement | RecurringInspection>(
    key: 'icaRequirements' | 'recurringInspections',
    index: number,
    patch: Partial<T>,
  ) =>
    setDraft((d) => ({
      ...d,
      [key]: (d[key] as T[]).map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const removeRepeatable = (key: 'icaRequirements' | 'recurringInspections', index: number) =>
    setDraft((d) => ({ ...d, [key]: d[key].filter((_, i) => i !== index) }));

  return (
    <GlassModal
      open={open}
      title={mod ? 'Edit modification' : 'Add modification'}
      sizeClassName="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            {mod ? 'Save changes' : 'Add modification'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Type"
            selectSize="sm"
            value={draft.modType}
            onChange={(e) => set('modType', e.target.value as ModType)}
          >
            {ALL_MOD_TYPES.map((t) => (
              <option key={t} value={t} className="bg-navy-800">
                {MOD_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select
            label="Status"
            selectSize="sm"
            value={draft.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {['installed', 'removed', 'superseded'].map((s) => (
              <option key={s} value={s} className="bg-navy-800">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label="Title"
          inputSize="sm"
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Garmin GTN 750Xi navigator installation"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Approval reference"
            inputSize="sm"
            value={draft.approvalRef}
            onChange={(e) => set('approvalRef', e.target.value)}
            placeholder="STC SA01234NM / 337 date / 8110-3 no."
          />
          <Input
            label="Holder / installer"
            inputSize="sm"
            value={draft.holder}
            onChange={(e) => set('holder', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Date installed"
            inputSize="sm"
            type="date"
            value={draft.dateInstalled}
            onChange={(e) => set('dateInstalled', e.target.value)}
          />
          <Input
            label="ATA chapters (comma-separated)"
            inputSize="sm"
            value={draft.ataChapters}
            onChange={(e) => set('ataChapters', e.target.value)}
            placeholder="34, 23"
          />
        </div>
        <Input
          label="Affected systems (comma-separated)"
          inputSize="sm"
          value={draft.affectedSystems}
          onChange={(e) => set('affectedSystems', e.target.value)}
          placeholder="GPS/WAAS navigation, VHF COM 1"
        />
        <div>
          <label className="block text-sm font-medium mb-2 text-white/80">Description</label>
          <textarea
            className={textareaClass}
            rows={3}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/65">
              ICA requirements
            </span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() =>
                set('icaRequirements', [
                  ...draft.icaRequirements,
                  { description: '', interval: '', reference: '' },
                ])
              }
            >
              + Add
            </Button>
          </div>
          {draft.icaRequirements.length === 0 && (
            <p className="text-xs text-white/45">No ICA tasks recorded.</p>
          )}
          {draft.icaRequirements.map((ica, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start">
              <Input
                inputSize="sm"
                aria-label="ICA description"
                value={ica.description}
                onChange={(e) => updateRepeatable<IcaRequirement>('icaRequirements', i, { description: e.target.value })}
                placeholder="Task description"
              />
              <Input
                inputSize="sm"
                aria-label="ICA interval"
                value={ica.interval ?? ''}
                onChange={(e) => updateRepeatable<IcaRequirement>('icaRequirements', i, { interval: e.target.value })}
                placeholder="Interval"
              />
              <Input
                inputSize="sm"
                aria-label="ICA reference"
                value={ica.reference ?? ''}
                onChange={(e) => updateRepeatable<IcaRequirement>('icaRequirements', i, { reference: e.target.value })}
                placeholder="Reference"
              />
              <Button variant="ghost" size="sm" type="button" onClick={() => removeRepeatable('icaRequirements', i)}>
                ✕
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/65">
              Recurring inspections
            </span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() =>
                set('recurringInspections', [
                  ...draft.recurringInspections,
                  { description: '', interval: undefined, intervalUnit: 'calendar_months', reference: '' },
                ])
              }
            >
              + Add
            </Button>
          </div>
          {draft.recurringInspections.length === 0 && (
            <p className="text-xs text-white/45">No recurring inspections recorded.</p>
          )}
          {draft.recurringInspections.map((insp, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start">
              <Input
                inputSize="sm"
                aria-label="Inspection description"
                value={insp.description}
                onChange={(e) =>
                  updateRepeatable<RecurringInspection>('recurringInspections', i, { description: e.target.value })
                }
                placeholder="Inspection description"
              />
              <Input
                inputSize="sm"
                aria-label="Inspection interval"
                type="number"
                value={insp.interval?.toString() ?? ''}
                onChange={(e) =>
                  updateRepeatable<RecurringInspection>('recurringInspections', i, {
                    interval: parseNumber(e.target.value),
                  })
                }
                placeholder="Interval"
              />
              <Select
                selectSize="sm"
                aria-label="Interval unit"
                value={insp.intervalUnit ?? 'calendar_months'}
                onChange={(e) =>
                  updateRepeatable<RecurringInspection>('recurringInspections', i, { intervalUnit: e.target.value })
                }
              >
                {['hours', 'cycles', 'calendar_months', 'calendar_days'].map((u) => (
                  <option key={u} value={u} className="bg-navy-800">
                    {u.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" size="sm" type="button" onClick={() => removeRepeatable('recurringInspections', i)}>
                ✕
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={draft.afmsRequired}
              onChange={(e) => set('afmsRequired', e.target.checked)}
              className="accent-sky-400"
            />
            AFM supplement required
          </label>
          <Input
            inputSize="sm"
            aria-label="AFM supplement reference"
            value={draft.afmsReference}
            onChange={(e) => set('afmsReference', e.target.value)}
            placeholder="AFMS document / revision"
          />
          <div>
            <label className="block text-xs text-white/60 mb-1">Limitations (one per line)</label>
            <textarea
              className={textareaClass}
              rows={2}
              value={draft.afmsLimitations}
              onChange={(e) => set('afmsLimitations', e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/65">
            Weight & balance
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              inputSize="sm"
              aria-label="Weight change"
              type="number"
              value={draft.weightChangeLbs}
              onChange={(e) => set('weightChangeLbs', e.target.value)}
              placeholder="Δ weight (lbs)"
            />
            <Input
              inputSize="sm"
              aria-label="Arm"
              type="number"
              value={draft.arm}
              onChange={(e) => set('arm', e.target.value)}
              placeholder="Arm (in)"
            />
            <Input
              inputSize="sm"
              aria-label="Moment change"
              type="number"
              value={draft.momentChange}
              onChange={(e) => set('momentChange', e.target.value)}
              placeholder="Δ moment"
            />
          </div>
          <Input
            inputSize="sm"
            aria-label="Weight and balance notes"
            value={draft.weightNotes}
            onChange={(e) => set('weightNotes', e.target.value)}
            placeholder="W&B notes"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-white/80">Placards (one per line)</label>
          <textarea
            className={textareaClass}
            rows={2}
            value={draft.placards}
            onChange={(e) => set('placards', e.target.value)}
          />
        </div>
        <Input
          label="Electrical load notes"
          inputSize="sm"
          value={draft.electricalLoadNotes}
          onChange={(e) => set('electricalLoadNotes', e.target.value)}
        />
      </div>
    </GlassModal>
  );
}
