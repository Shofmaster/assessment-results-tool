import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useAircraftTypes,
  useAircraftAssetsForLibrary,
  useUpdateTechnicalPublication,
} from '../../hooks/useConvexData';
import { Button, Badge } from '../ui';
import type { Id } from '../../../convex/_generated/dataModel';

type Pub = {
  _id: string;
  projectId: string;
  aircraftIds?: string[];
  aircraftTypeIds?: string[];
};

export default function PublicationScopeEditor({ pub }: { pub: Pub }) {
  const types = useAircraftTypes(pub.projectId) as Array<{ _id: string; name: string }> | undefined;
  const aircraft = useAircraftAssetsForLibrary(pub.projectId) as Array<{
    _id: string;
    tailNumber: string;
    aircraftTypeId?: string;
  }> | undefined;
  const updatePublication = useUpdateTechnicalPublication();
  const [saving, setSaving] = useState(false);

  const typeIds = pub.aircraftTypeIds ?? [];
  const tailIds = pub.aircraftIds ?? [];
  const isFleetWide = typeIds.length === 0 && tailIds.length === 0;

  const typeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of types ?? []) m.set(String(t._id), t.name);
    return m;
  }, [types]);

  const tailById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aircraft ?? []) m.set(String(a._id), a.tailNumber);
    return m;
  }, [aircraft]);

  const saveScope = async (nextTypeIds: string[], nextTailIds: string[]) => {
    setSaving(true);
    try {
      await updatePublication({
        publicationId: pub._id as Id<'technicalPublications'>,
        aircraftTypeIds: nextTypeIds.length ? (nextTypeIds as Id<'aircraftTypes'>[]) : [],
        aircraftIds: nextTailIds.length ? (nextTailIds as Id<'aircraftAssets'>[]) : [],
      });
      toast.success('Scope updated');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update scope');
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (id: string) => {
    const next = typeIds.includes(id) ? typeIds.filter((x) => x !== id) : [...typeIds, id];
    void saveScope(next, tailIds);
  };

  const toggleTail = (id: string) => {
    const next = tailIds.includes(id) ? tailIds.filter((x) => x !== id) : [...tailIds, id];
    void saveScope(typeIds, next);
  };

  const setFleetWide = () => void saveScope([], []);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white/90">Publication scope</h3>
        {!isFleetWide ? (
          <Button size="sm" variant="secondary" disabled={saving} onClick={setFleetWide}>
            Set fleet-wide
          </Button>
        ) : (
          <Badge variant="default">Fleet-wide</Badge>
        )}
      </div>
      {!isFleetWide ? (
        <div className="flex flex-wrap gap-1">
          {typeIds.map((id) => (
            <Badge key={`t-${id}`} variant="default">
              Type: {typeNameById.get(id) ?? id}
            </Badge>
          ))}
          {tailIds.map((id) => (
            <Badge key={`a-${id}`} variant="default">
              {tailById.get(id) ?? id}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/55">Visible to all aircraft in the company library.</p>
      )}
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-white/50 mb-1">Aircraft types</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {(types ?? []).length === 0 ? (
              <p className="text-white/40">No types defined for this project.</p>
            ) : (
              (types ?? []).map((t) => (
                <label key={t._id} className="flex items-center gap-2 text-white/75 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={typeIds.includes(String(t._id))}
                    onChange={() => toggleType(String(t._id))}
                  />
                  {t.name}
                </label>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="text-white/50 mb-1">Individual tails</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {(aircraft ?? []).length === 0 ? (
              <p className="text-white/40">No aircraft in this project.</p>
            ) : (
              (aircraft ?? []).map((a) => (
                <label key={a._id} className="flex items-center gap-2 text-white/75 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={tailIds.includes(String(a._id))}
                    onChange={() => toggleTail(String(a._id))}
                  />
                  {a.tailNumber}
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
