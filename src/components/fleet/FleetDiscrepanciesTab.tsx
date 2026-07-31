import { useMemo, useState } from 'react';
import { FiAlertTriangle, FiSearch } from 'react-icons/fi';
import type { AircraftAsset } from '../../types/aircraftAsset';
import type { AircraftDiscrepancy } from '../../types/discrepancy';
import DiscrepancyResearchModal from '../DiscrepancyResearchModal';
import { GlassCard } from '../ui';

const STATUS_FILTERS = ['all', 'open', 'deferred', 'resolved'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function statusColor(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-rose-500/20 text-rose-300';
    case 'deferred':
      return 'bg-amber-500/20 text-amber-300';
    case 'resolved':
    case 'closed':
      return 'bg-green-500/20 text-green-300';
    default:
      return 'bg-white/10 text-white/70';
  }
}

/** Sort key: open first, then deferred, then everything closed out. */
function statusOrder(s: string): number {
  return s === 'open' ? 0 : s === 'deferred' ? 1 : s === 'resolved' ? 2 : 3;
}

/**
 * Project-wide discrepancy list. Previously these were only visible one
 * aircraft at a time, inside an expanded card on the old Fleet page.
 */
export default function FleetDiscrepanciesTab({
  aircraft,
  discrepancies,
  initialTailId,
}: {
  aircraft: AircraftAsset[];
  discrepancies: AircraftDiscrepancy[];
  initialTailId: string | null;
}) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tailId, setTailId] = useState<string>(initialTailId ?? '');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tailById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aircraft) m.set(a._id, a.tailNumber);
    return m;
  }, [aircraft]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: discrepancies.length };
    for (const d of discrepancies) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [discrepancies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return discrepancies
      .filter((d) => {
        if (status !== 'all' && d.status !== status) return false;
        if (tailId && d.aircraftId !== tailId) return false;
        if (q && !d.description.toLowerCase().includes(q) && !(d.ataChapter ?? '').includes(q))
          return false;
        return true;
      })
      .sort((a, b) => {
        const diff = statusOrder(a.status) - statusOrder(b.status);
        if (diff !== 0) return diff;
        return (b.discoveredAt ?? '').localeCompare(a.discoveredAt ?? '');
      });
  }, [discrepancies, status, tailId, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              status === s
                ? 'bg-sky/25 text-sky-lighter border border-sky-light/30'
                : 'border border-transparent text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            {s} {counts[s] != null ? `(${counts[s]})` : '(0)'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="sr-only" htmlFor="discrepancy-tail">
            Filter by aircraft
          </label>
          <select
            id="discrepancy-tail"
            value={tailId}
            onChange={(e) => setTailId(e.target.value)}
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm focus:border-sky-light focus:outline-none [&>option]:bg-navy-900 [&>option]:text-white"
          >
            <option value="">All aircraft</option>
            {aircraft.map((a) => (
              <option key={a._id} value={a._id}>
                {a.tailNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="relative min-w-[200px] flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" aria-hidden />
          <label className="sr-only" htmlFor="discrepancy-search">
            Search discrepancies
          </label>
          <input
            id="discrepancy-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description or ATA chapter"
            className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-10 pr-3 focus:border-sky-light focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <GlassCard padding="none" className="p-8 text-center text-white/60">
          {discrepancies.length === 0
            ? 'No discrepancies on file. Sync from Avianis on the Monitoring tab to pull open squawks and MEL items.'
            : 'No discrepancies match these filters.'}
        </GlassCard>
      ) : (
        <GlassCard padding="none" className="overflow-hidden">
          <ul className="divide-y divide-white/5">
            {filtered.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(d.status)}`}
                >
                  {d.status}
                </span>
                <span className="font-display text-sm font-bold text-white/85">
                  {tailById.get(d.aircraftId) ?? '—'}
                </span>
                {d.ataChapter && <span className="text-xs text-white/50">ATA {d.ataChapter}</span>}
                <span className="min-w-[200px] flex-1 text-sm">{d.description}</span>
                {d.discoveredAt && (
                  <span className="text-xs text-white/50">
                    {new Date(d.discoveredAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedId(d._id)}
                  className="flex items-center gap-1.5 rounded-lg bg-sky/30 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-sky/50"
                >
                  <FiAlertTriangle aria-hidden />
                  {d.research ? 'View research' : 'Research'}
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {selectedId && (
        <DiscrepancyResearchModal
          discrepancyId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
