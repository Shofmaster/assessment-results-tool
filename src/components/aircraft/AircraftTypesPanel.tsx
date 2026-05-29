import { useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import {
  useAircraftTypes,
  useCreateAircraftType,
  useUpdateAircraftType,
  useRemoveAircraftType,
  useAircraftAssetsForLibrary,
  useBackfillAircraftTypes,
} from '../../hooks/useConvexData';
import type { AircraftType } from '../../types/aircraftType';
import { Button, Input } from '../ui';

type Props = {
  projectId: string;
  onClose?: () => void;
  embedded?: boolean;
};

export default function AircraftTypesPanel({ projectId, onClose, embedded = false }: Props) {
  const types = (useAircraftTypes(projectId) ?? []) as AircraftType[];
  const assets = (useAircraftAssetsForLibrary(projectId) ?? []) as Array<{ _id: string; aircraftTypeId?: string; tailNumber: string }>;
  const createType = useCreateAircraftType();
  const updateType = useUpdateAircraftType();
  const removeType = useRemoveAircraftType();
  const backfillTypes = useBackfillAircraftTypes();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', manufacturer: '', model: '', variant: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const tailCountByType = (typeId: string) =>
    assets.filter((a) => a.aircraftTypeId === typeId).length;

  const resetForm = () => {
    setForm({ name: '', manufacturer: '', model: '', variant: '', notes: '' });
    setEditingId(null);
  };

  const startEdit = (t: AircraftType) => {
    setEditingId(t._id);
    setForm({
      name: t.name,
      manufacturer: t.manufacturer ?? '',
      model: t.model ?? '',
      variant: t.variant ?? '',
      notes: t.notes ?? '',
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Type name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateType({
          aircraftTypeId: editingId as any,
          name: form.name,
          manufacturer: form.manufacturer || undefined,
          model: form.model || undefined,
          variant: form.variant || undefined,
          notes: form.notes || undefined,
        });
        toast.success('Aircraft type updated');
      } else {
        await createType({
          projectId: projectId as any,
          name: form.name,
          manufacturer: form.manufacturer || undefined,
          model: form.model || undefined,
          variant: form.variant || undefined,
          notes: form.notes || undefined,
        });
        toast.success('Aircraft type created');
      }
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!window.confirm(`Remove type "${name}"? Tails keep their records but lose this type assignment.`)) return;
    try {
      await removeType({ aircraftTypeId: id as any });
      toast.success('Aircraft type removed');
      if (editingId === id) resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const shellClass = embedded
    ? 'space-y-4'
    : 'bg-[#fffaf2] border border-amber-300/80 rounded-xl shadow-2xl w-full max-w-lg p-6 text-stone-800 max-h-[85vh] overflow-auto';

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Aircraft types</h2>
          <p className="text-xs text-stone-600 mt-1">
            Define make/model families (e.g. G650). Link manuals to a type so all tails of that type share them.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-800" aria-label="Close">
            <FiX />
          </button>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <Input
          placeholder="Display name (e.g. Gulfstream G650)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Manufacturer"
            value={form.manufacturer}
            onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
          />
          <Input
            placeholder="Model"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          />
        </div>
        <Input
          placeholder="Variant (optional)"
          value={form.variant}
          onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))}
        />
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {editingId ? 'Update type' : 'Add type'}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
      </div>

      {assets.length > 0 ? (
        <div className="mb-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = (await backfillTypes({ projectId: projectId as any })) as {
                  typesCreated: number;
                  assetsLinked: number;
                  publicationsLinked: number;
                };
                toast.success(
                  `Backfill: ${res.typesCreated} types, ${res.assetsLinked} tails linked, ${res.publicationsLinked} publications scoped`,
                );
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Backfill failed');
              } finally {
                setSaving(false);
              }
            }}
          >
            Import types from existing tails
          </Button>
        </div>
      ) : null}

      <ul className="divide-y divide-amber-200/80 border border-amber-200 rounded-lg overflow-hidden">
        {types.length === 0 ? (
          <li className="px-4 py-6 text-sm text-stone-500 text-center">No types yet. Add one above.</li>
        ) : (
          types.map((t) => (
            <li key={t._id} className="flex items-center gap-2 px-3 py-2.5 bg-[#fffdf7] hover:bg-amber-50/50">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-stone-800 truncate">{t.name}</div>
                <div className="text-xs text-stone-500">
                  {[t.manufacturer, t.model, t.variant].filter(Boolean).join(' · ') || '—'}
                  {' · '}
                  {tailCountByType(t._id)} tail{tailCountByType(t._id) === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 text-stone-500 hover:text-sky-800"
                onClick={() => startEdit(t)}
                aria-label={`Edit ${t.name}`}
              >
                <FiEdit2 />
              </button>
              <button
                type="button"
                className="p-1.5 text-stone-500 hover:text-red-700"
                onClick={() => handleRemove(t._id, t.name)}
                aria-label={`Remove ${t.name}`}
              >
                <FiTrash2 />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function AircraftTypesPanelModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <AircraftTypesPanel projectId={projectId} onClose={onClose} />
    </div>
  );
}
