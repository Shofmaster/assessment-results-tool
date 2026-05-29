import { useMemo, useState } from 'react';
import { FiChevronDown, FiChevronRight, FiGlobe, FiLayers } from 'react-icons/fi';
import type { AircraftType } from '../../types/aircraftType';
import type { AircraftAsset } from '../../types/aircraftAsset';
import type { LibraryAircraftScope } from '../../hooks/useConvexData';

type Props = {
  types: AircraftType[];
  aircraft: AircraftAsset[];
  scope: LibraryAircraftScope;
  onSelectScope: (scope: LibraryAircraftScope) => void;
  title?: string;
};

export default function AircraftScopeTree({
  types,
  aircraft,
  scope,
  onSelectScope,
  title = 'Aircraft scope',
}: Props) {
  const [expandedTypeIds, setExpandedTypeIds] = useState<Set<string>>(() => new Set(types.map((t) => t._id)));

  const tailsByType = useMemo(() => {
    const map = new Map<string, AircraftAsset[]>();
    const unassigned: AircraftAsset[] = [];
    for (const a of aircraft) {
      if (a.aircraftTypeId) {
        const list = map.get(a.aircraftTypeId) ?? [];
        list.push(a);
        map.set(a.aircraftTypeId, list);
      } else {
        unassigned.push(a);
      }
    }
    for (const [, list] of map) {
      list.sort((x, y) => x.tailNumber.localeCompare(y.tailNumber));
    }
    unassigned.sort((x, y) => x.tailNumber.localeCompare(y.tailNumber));
    return { map, unassigned };
  }, [aircraft]);

  const toggleType = (id: string) => {
    setExpandedTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fleetSelected = scope.kind === 'fleet';
  const typeSelected = (id: string) => scope.kind === 'type' && scope.aircraftTypeId === id;
  const tailSelected = (id: string) => scope.kind === 'tail' && scope.aircraftId === id;

  const rowBtn = (active: boolean) =>
    `w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
      active ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/70 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2">{title}</div>
      <button type="button" className={rowBtn(fleetSelected)} onClick={() => onSelectScope({ kind: 'fleet' })}>
        <span className="flex items-center gap-2">
          <FiGlobe className="flex-shrink-0 opacity-70" />
          Fleet-wide
        </span>
      </button>

      <div className="mt-2 space-y-0.5">
        {types.map((t) => {
          const tails = tailsByType.map.get(t._id) ?? [];
          const expanded = expandedTypeIds.has(t._id);
          return (
            <div key={t._id}>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="p-1 text-white/40 hover:text-white/70"
                  onClick={() => toggleType(t._id)}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                </button>
                <button
                  type="button"
                  className={`${rowBtn(typeSelected(t._id))} flex-1`}
                  onClick={() => onSelectScope({ kind: 'type', aircraftTypeId: t._id })}
                >
                  <span className="flex items-center gap-2 truncate">
                    <FiLayers className="flex-shrink-0 opacity-70" />
                    {t.name}
                    <span className="text-white/40 text-xs">({tails.length})</span>
                  </span>
                </button>
              </div>
              {expanded &&
                tails.map((a) => (
                  <button
                    key={a._id}
                    type="button"
                    className={`${rowBtn(tailSelected(a._id))} pl-7`}
                    onClick={() => onSelectScope({ kind: 'tail', aircraftId: a._id })}
                  >
                    {a.tailNumber}
                  </button>
                ))}
            </div>
          );
        })}
        {tailsByType.unassigned.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-wide text-white/40 px-2 mb-1">Unassigned tails</div>
            {tailsByType.unassigned.map((a) => (
              <button
                key={a._id}
                type="button"
                className={`${rowBtn(tailSelected(a._id))} pl-2`}
                onClick={() => onSelectScope({ kind: 'tail', aircraftId: a._id })}
              >
                {a.tailNumber}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
