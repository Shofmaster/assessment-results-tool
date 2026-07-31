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
import { useConfirmDialog } from '../confirm/ConfirmDialogProvider';
import { PANEL_TONES, type PanelTone } from './aircraftPanelTone';

type Props = {
  projectId: string;
  onClose?: () => void;
  embedded?: boolean;
  /** `paper` (default) for the logbook surfaces, `glass` for the Fleet page. */
  tone?: PanelTone;
};

export default function AircraftTypesPanel({
  projectId,
  onClose,
  embedded = false,
  tone = 'paper',
}: Props) {
  const t = PANEL_TONES[tone];
  const types = (useAircraftTypes(projectId) ?? []) as AircraftType[];
  const assets = (useAircraftAssetsForLibrary(projectId) ?? []) as Array<{ _id: string; aircraftTypeId?: string; tailNumber: string }>;
  const createType = useCreateAircraftType();
  const updateType = useUpdateAircraftType();
  const removeType = useRemoveAircraftType();
  const confirmDialog = useConfirmDialog();
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

  const startEdit = (type: AircraftType) => {
    setEditingId(type._id);
    setForm({
      name: type.name,
      manufacturer: type.manufacturer ?? '',
      model: type.model ?? '',
      variant: type.variant ?? '',
      notes: type.notes ?? '',
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
    const ok = await confirmDialog({
      title: 'Remove aircraft type?',
      message: `Remove type "${name}"? Tails keep their records but lose this type assignment.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
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
    : `${t.shell} w-full max-w-lg p-6 max-h-[85vh] overflow-auto`;

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={t.heading}>Aircraft types</h2>
          <p className={`${t.description} mt-1`}>
            Define make/model families (e.g. G650). Link manuals to a type so all tails of that type share them.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className={t.closeButton} aria-label="Close">
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

      <ul className={t.listWrapper}>
        {types.length === 0 ? (
          <li className={t.listEmpty}>No types yet. Add one above.</li>
        ) : (
          types.map((type) => (
            <li key={type._id} className={`flex items-center gap-2 px-3 py-2.5 ${t.listRow}`}>
              <div className="flex-1 min-w-0">
                <div className={t.listPrimary}>{type.name}</div>
                <div className={t.listSecondary}>
                  {[type.manufacturer, type.model, type.variant].filter(Boolean).join(' · ') || '—'}
                  {' · '}
                  {tailCountByType(type._id)} tail{tailCountByType(type._id) === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                className={t.iconButton}
                onClick={() => startEdit(type)}
                aria-label={`Edit ${type.name}`}
              >
                <FiEdit2 />
              </button>
              <button
                type="button"
                className={t.iconButtonDanger}
                onClick={() => handleRemove(type._id, type.name)}
                aria-label={`Remove ${type.name}`}
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
