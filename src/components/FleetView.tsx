import { useEffect, useMemo, useRef, useState } from 'react';
import { FiRefreshCw, FiAlertTriangle, FiChevronDown, FiChevronRight, FiSearch } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useAvianisStatus,
  useFleetAircraft,
  useFleetDiscrepancies,
  useSyncAvianis,
  useUserSettings,
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import DiscrepancyResearchModal from './DiscrepancyResearchModal';
import type { AircraftDiscrepancy } from '../types/discrepancy';

interface AircraftRow {
  _id: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  currentTotalTime?: number;
  currentTotalCycles?: number;
  currentTotalLandings?: number;
  currentAsOfDate?: string;
  lastSyncedAt?: number;
}

function formatNumber(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

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

export default function FleetView() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);

  const storeProjectId = useAppStore((s) => s.activeProjectId);
  const userSettings = useUserSettings();
  const activeProjectId = useMemo(() => {
    if (storeProjectId) return storeProjectId;
    const sid = userSettings?.activeProjectId;
    return sid ? String(sid) : null;
  }, [storeProjectId, userSettings?.activeProjectId]);

  const avianisStatus = useAvianisStatus();
  const aircraft = (useFleetAircraft(activeProjectId ?? undefined) ?? []) as AircraftRow[];
  const discrepancies = (useFleetDiscrepancies(activeProjectId ?? undefined) ??
    []) as AircraftDiscrepancy[];
  const syncAvianis = useSyncAvianis();

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedDiscrepancyId, setSelectedDiscrepancyId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    // Auto-expand the first aircraft if none expanded yet.
    if (aircraft.length > 0 && Object.keys(expandedIds).length === 0) {
      setExpandedIds({ [aircraft[0]._id]: true });
    }
  }, [aircraft, expandedIds]);

  const handleSync = async () => {
    if (!activeProjectId) {
      setSyncMessage('Select an active project first.');
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = (await syncAvianis({ projectId: activeProjectId as any })) as {
        aircraftSynced: number;
        discrepanciesSynced: number;
      };
      setSyncMessage(
        `Synced ${res.aircraftSynced} aircraft and ${res.discrepanciesSynced} discrepancies.`,
      );
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const discrepanciesByAircraft = useMemo(() => {
    const map = new Map<string, AircraftDiscrepancy[]>();
    for (const d of discrepancies) {
      if (!map.has(d.aircraftId)) map.set(d.aircraftId, []);
      map.get(d.aircraftId)!.push(d);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const order = (s: string) =>
          s === 'open' ? 0 : s === 'deferred' ? 1 : s === 'resolved' ? 2 : 3;
        const diff = order(a.status) - order(b.status);
        if (diff !== 0) return diff;
        return (b.discoveredAt ?? '').localeCompare(a.discoveredAt ?? '');
      });
    }
    return map;
  }, [discrepancies]);

  const filteredAircraft = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return aircraft;
    return aircraft.filter(
      (a) =>
        a.tailNumber.toLowerCase().includes(f) ||
        (a.make ?? '').toLowerCase().includes(f) ||
        (a.model ?? '').toLowerCase().includes(f),
    );
  }, [aircraft, filter]);

  const toggle = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Fleet &amp; Discrepancies
        </h1>
        <p className="text-white/70">
          Aircraft current times and open discrepancies pulled from Avianis. Click a discrepancy
          to research a fix using the project's manuals.
        </p>
      </div>

      <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing || !avianisStatus?.configured || !activeProjectId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-sky to-sky-light hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiRefreshCw className={`text-lg ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync from Avianis'}
          </button>
          <div className="flex-1 min-w-[200px] relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by tail / make / model"
              className="w-full pl-10 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light"
            />
          </div>
          <div className="text-sm text-white/60">
            {avianisStatus?.lastSyncedAt
              ? `Last sync: ${new Date(avianisStatus.lastSyncedAt).toLocaleString()}`
              : 'Never synced'}
          </div>
        </div>
        {!avianisStatus?.configured && (
          <p className="text-sm text-amber-300 mt-3">
            Avianis is not configured. Open <strong>Settings → Avianis Connection</strong> to
            enter credentials.
          </p>
        )}
        {syncMessage && <p className="text-sm text-white/70 mt-3">{syncMessage}</p>}
        {avianisStatus?.lastSyncError && (
          <p className="text-sm text-rose-300 mt-1">
            Last sync error: {avianisStatus.lastSyncError}
          </p>
        )}
      </div>

      {filteredAircraft.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-white/60">
          {aircraft.length === 0
            ? 'No aircraft yet. Connect to Avianis in Settings and click "Sync from Avianis".'
            : 'No aircraft match this filter.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAircraft.map((a) => {
            const expanded = !!expandedIds[a._id];
            const aircraftDiscrepancies = discrepanciesByAircraft.get(a._id) ?? [];
            const openCount = aircraftDiscrepancies.filter((d) => d.status === 'open').length;
            const deferredCount = aircraftDiscrepancies.filter(
              (d) => d.status === 'deferred',
            ).length;
            return (
              <div key={a._id} className="glass rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggle(a._id)}
                  className="w-full p-4 sm:p-5 flex flex-wrap items-center gap-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {expanded ? <FiChevronDown /> : <FiChevronRight />}
                    <div>
                      <div className="text-lg font-display font-bold">{a.tailNumber}</div>
                      <div className="text-xs text-white/60">
                        {[a.make, a.model].filter(Boolean).join(' ') || '—'}
                        {a.serial ? ` · S/N ${a.serial}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1" />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/50">TT</div>
                      <div className="font-medium">{formatNumber(a.currentTotalTime)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/50">
                        Cycles
                      </div>
                      <div className="font-medium">{formatNumber(a.currentTotalCycles)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/50">
                        Lndgs
                      </div>
                      <div className="font-medium">{formatNumber(a.currentTotalLandings)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {openCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/20 text-rose-300">
                        {openCount} open
                      </span>
                    )}
                    {deferredCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">
                        {deferredCount} deferred
                      </span>
                    )}
                    {openCount === 0 && deferredCount === 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-300">
                        No open items
                      </span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-white/10 p-4 sm:p-5">
                    {aircraftDiscrepancies.length === 0 ? (
                      <p className="text-sm text-white/60">No discrepancies on file.</p>
                    ) : (
                      <ul className="divide-y divide-white/5">
                        {aircraftDiscrepancies.map((d) => (
                          <li
                            key={d._id}
                            className="py-3 flex flex-wrap items-center gap-3"
                          >
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${statusColor(
                                d.status,
                              )}`}
                            >
                              {d.status}
                            </span>
                            {d.ataChapter && (
                              <span className="text-xs text-white/50">ATA {d.ataChapter}</span>
                            )}
                            <span className="text-sm flex-1 min-w-[200px]">{d.description}</span>
                            {d.discoveredAt && (
                              <span className="text-xs text-white/50">
                                {new Date(d.discoveredAt).toLocaleDateString()}
                              </span>
                            )}
                            <button
                              onClick={() => setSelectedDiscrepancyId(d._id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-sky/30 hover:bg-sky/50 transition-colors"
                            >
                              <FiAlertTriangle />
                              {d.research ? 'View research' : 'Research'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedDiscrepancyId && (
        <DiscrepancyResearchModal
          discrepancyId={selectedDiscrepancyId}
          onClose={() => setSelectedDiscrepancyId(null)}
        />
      )}
    </div>
  );
}
