import { useMemo, useState } from 'react';
import { FiPlus, FiSearch } from 'react-icons/fi';
import { api } from '../../../convex/_generated/api';
import { FEATURE_KEYS } from '../../config/featureKeys';
import {
  useAircraftTypes,
  useCreateAircraftAsset,
  useIsFeatureEnabled,
} from '../../hooks/useConvexData';
import { useQuery } from '../../hooks/useConvexQueryNoThrow';
import type { AircraftAsset } from '../../types/aircraftAsset';
import type { AircraftDiscrepancy } from '../../types/discrepancy';
import type { AircraftType } from '../../types/aircraftType';
import AddAircraftModal from '../aircraft/AddAircraftModal';
import { GlassCard } from '../ui';
import AircraftDetailPanel from './AircraftDetailPanel';
import { formatNumber } from './fleetFormat';
import {
  dueInText,
  forecastProject,
  type DueForecastInput,
  type DueForecastItem,
} from '../../utils/dueForecast';

/** Stable identity so a still-loading query doesn't invalidate every memo. */
const NO_TYPES: AircraftType[] = [];

export default function FleetAircraftTab({
  projectId,
  aircraft,
  discrepancies,
  selectedTailId,
  onSelectTail,
  onViewDiscrepancies,
}: {
  projectId: string;
  aircraft: AircraftAsset[];
  discrepancies: AircraftDiscrepancy[];
  selectedTailId: string | null;
  onSelectTail: (id: string | null) => void;
  onViewDiscrepancies: (aircraftId: string) => void;
}) {
  const aircraftTypes = (useAircraftTypes(projectId) as AircraftType[] | undefined) ?? NO_TYPES;
  const createAircraft = useCreateAircraftAsset();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('');

  const isDueForecastEnabled = useIsFeatureEnabled(FEATURE_KEYS.DUE_FORECAST);
  const dueSources = useQuery(
    api.dueForecast.sourcesForProject,
    isDueForecastEnabled && projectId ? { projectId: projectId as never } : 'skip',
  );

  /** Soonest forecast item per aircraft, for the roster "Next due" column. */
  const nextDueByAircraft = useMemo(() => {
    const map = new Map<string, DueForecastItem>();
    if (!dueSources) return map;
    const inputs: DueForecastInput[] = [
      ...(dueSources.recurringEntries as DueForecastInput[]),
      ...(dueSources.components as unknown as DueForecastInput[]),
    ];
    const summary = forecastProject(dueSources.aircraft, inputs, new Date());
    for (const item of summary.items) {
      if (!item.aircraftId || item.bucket === 'unforecastable' || typeof item.days !== 'number')
        continue;
      const existing = map.get(item.aircraftId);
      if (!existing || (existing.days ?? Infinity) > item.days) map.set(item.aircraftId, item);
    }
    return map;
  }, [dueSources]);

  /** Open and deferred stay separate — a deferred MEL is not an open squawk. */
  const countsByAircraft = useMemo(() => {
    const map = new Map<string, { open: number; deferred: number }>();
    for (const d of discrepancies) {
      if (d.status !== 'open' && d.status !== 'deferred') continue;
      const entry = map.get(d.aircraftId) ?? { open: 0, deferred: 0 };
      entry[d.status as 'open' | 'deferred'] += 1;
      map.set(d.aircraftId, entry);
    }
    return map;
  }, [discrepancies]);

  const typeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of aircraftTypes) m.set(t._id, t.name);
    return m;
  }, [aircraftTypes]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return aircraft;
    return aircraft.filter(
      (a) =>
        a.tailNumber.toLowerCase().includes(f) ||
        (a.make ?? '').toLowerCase().includes(f) ||
        (a.model ?? '').toLowerCase().includes(f),
    );
  }, [aircraft, filter]);

  const selected = selectedTailId ? aircraft.find((a) => a._id === selectedTailId) : undefined;

  if (selected) {
    return (
      <AircraftDetailPanel
        aircraft={selected}
        aircraftTypes={aircraftTypes}
        projectId={projectId}
        openDiscrepancyCount={
          discrepancies.filter((d) => d.aircraftId === selected._id && d.status === 'open').length
        }
        onBack={() => onSelectTail(null)}
        onViewDiscrepancies={() => onViewDiscrepancies(selected._id)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" aria-hidden />
          <label className="sr-only" htmlFor="fleet-filter">
            Filter aircraft
          </label>
          <input
            id="fleet-filter"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by tail / make / model"
            className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-10 pr-3 focus:border-sky-light focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky to-sky-light px-5 py-2.5 font-semibold transition-all hover:shadow-lg hover:shadow-sky/30"
        >
          <FiPlus aria-hidden /> Add aircraft
        </button>
      </div>

      {filtered.length === 0 ? (
        <GlassCard padding="none" className="p-8 text-center text-white/60">
          {aircraft.length === 0
            ? 'No aircraft yet. Add one manually, or connect Avianis on the Monitoring tab and sync.'
            : 'No aircraft match this filter.'}
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/50">
                  <th scope="col" className="px-4 py-3 text-left font-medium">Tail</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Type / model</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">TT</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Cycles</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Lndgs</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Next due</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Discrepancies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((a) => {
                  const nextDue = nextDueByAircraft.get(a._id);
                  const counts = countsByAircraft.get(a._id) ?? { open: 0, deferred: 0 };
                  const typeName = a.aircraftTypeId ? typeNameById.get(a.aircraftTypeId) : undefined;
                  return (
                    <tr
                      key={a._id}
                      onClick={() => onSelectTail(a._id)}
                      className="cursor-pointer transition-colors hover:bg-white/5"
                    >
                      <th scope="row" className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTail(a._id);
                          }}
                          className="font-display font-bold text-white hover:text-sky-lighter"
                        >
                          {a.tailNumber}
                        </button>
                        {a.serial ? (
                          <div className="text-[11px] font-normal text-white/45">S/N {a.serial}</div>
                        ) : null}
                      </th>
                      <td className="px-4 py-3 text-white/70">
                        {typeName ? (
                          <div className="text-white/85">{typeName}</div>
                        ) : null}
                        <div className={typeName ? 'text-[11px] text-white/45' : ''}>
                          {[a.make, a.model].filter(Boolean).join(' ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatNumber(a.currentTotalTime)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatNumber(a.currentTotalCycles)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatNumber(a.currentTotalLandings)}
                      </td>
                      <td className="px-4 py-3">
                        {nextDue ? (
                          <span
                            title={nextDue.title}
                            className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                              nextDue.bucket === 'overdue'
                                ? 'bg-rose-500/20 text-rose-300'
                                : nextDue.bucket === 'due30'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-white/10 text-white/70'
                            }`}
                          >
                            {nextDue.title.slice(0, 24)}
                            {nextDue.title.length > 24 ? '…' : ''} · {dueInText(nextDue)}
                          </span>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {counts.open > 0 && (
                            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
                              {counts.open} open
                            </span>
                          )}
                          {counts.deferred > 0 && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                              {counts.deferred} deferred
                            </span>
                          )}
                          {counts.open === 0 && counts.deferred === 0 && (
                            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-300">
                              None
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {showAdd && (
        <AddAircraftModal
          projectId={projectId}
          aircraftTypes={aircraftTypes}
          onCreate={createAircraft}
          onClose={() => setShowAdd(false)}
          onCreated={(id) => {
            setShowAdd(false);
            onSelectTail(id);
          }}
          tone="glass"
        />
      )}
    </div>
  );
}
