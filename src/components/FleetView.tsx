import { useEffect, useMemo, useRef, useState } from 'react';
import { FiRefreshCw, FiAlertTriangle, FiChevronDown, FiChevronRight, FiSearch } from 'react-icons/fi';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import {
  useAvianisStatus,
  useFleetAircraft,
  useFleetDiscrepancies,
  useIsFeatureEnabled,
  useSyncAvianis,
  useUserSettings,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import DiscrepancyResearchModal from './DiscrepancyResearchModal';
import AskPanel from './ask/AskPanel';
import LifecycleTimeline from './fleet/LifecycleTimeline';
import { ModificationsTab } from './fleet/ModificationsTab';
import type { AircraftDiscrepancy } from '../types/discrepancy';
import {
  deriveDailyRates,
  dueInText,
  forecastProject,
  type DueForecastInput,
  type DueForecastItem,
  type DueUnit,
} from '../utils/dueForecast';
import { useQuery } from '../hooks/useConvexQueryNoThrow';

interface AircraftRow {
  _id: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  baselineTotalTime?: number;
  baselineTotalCycles?: number;
  baselineTotalLandings?: number;
  baselineAsOfDate?: string;
  currentTotalTime?: number;
  currentTotalCycles?: number;
  currentTotalLandings?: number;
  currentAsOfDate?: string;
  estDailyHours?: number;
  estDailyCycles?: number;
  estDailyLandings?: number;
  lastSyncedAt?: number;
}

function formatNumber(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

const RATE_FIELDS: Array<{ unit: DueUnit; field: 'estDailyHours' | 'estDailyCycles' | 'estDailyLandings'; label: string; suffix: string }> = [
  { unit: 'hours', field: 'estDailyHours', label: 'Hours / day', suffix: 'hr' },
  { unit: 'cycles', field: 'estDailyCycles', label: 'Cycles / day', suffix: 'cyc' },
  { unit: 'landings', field: 'estDailyLandings', label: 'Landings / day', suffix: 'ldg' },
];

/**
 * Manual daily-utilization overrides for due-list forecasting. Shows the
 * Avianis-derived rate when one exists so users can see which rate the
 * forecast actually uses (a derived rate over a >=30-day window wins).
 */
function UtilizationRatesEditor({ aircraft }: { aircraft: AircraftRow }) {
  const setRates = useMutation(api.dueForecast.setEstimatedDailyRates);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rates = useMemo(() => deriveDailyRates({ aircraftId: aircraft._id, ...aircraft }, new Date()), [aircraft]);

  const draftFor = (field: string, stored: number | undefined): string =>
    drafts[field] !== undefined ? drafts[field] : stored !== undefined ? String(stored) : '';

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, number | null> = {};
      for (const { field } of RATE_FIELDS) {
        if (drafts[field] === undefined) continue;
        const trimmed = drafts[field].trim();
        if (trimmed === '') {
          payload[field] = null; // clear the override
        } else {
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            setMessage(`Enter a positive number for ${field.replace('estDaily', '').toLowerCase()} (or leave blank).`);
            setSaving(false);
            return;
          }
          payload[field] = parsed;
        }
      }
      if (Object.keys(payload).length === 0) {
        setMessage('No changes to save.');
        setSaving(false);
        return;
      }
      await setRates({ aircraftId: aircraft._id as never, ...payload });
      setDrafts({});
      setMessage('Utilization rates saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save rates.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-medium text-white/90">Utilization rates (due-list forecasting)</p>
      <p className="mt-1 text-xs text-white/55">
        Used to project hours/cycles items into calendar days. Leave blank to rely on Avianis-derived rates.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {RATE_FIELDS.map(({ unit, field, label, suffix }) => {
          const derived = rates[unit];
          return (
            <label key={field} className="block">
              <span className="text-[10px] uppercase tracking-wide text-white/50">{label}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftFor(field, aircraft[field])}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm focus:border-sky-light focus:outline-none"
              />
              <span className="mt-1 block text-[10px] text-white/45">
                {derived?.source === 'derived'
                  ? `Derived from Avianis: ${derived.perDay.toFixed(2)} ${suffix}/day over ${derived.windowDays} days`
                  : derived?.source === 'manual'
                    ? `Using manual rate: ${derived.perDay.toFixed(2)} ${suffix}/day`
                    : 'No rate available yet'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky/30 px-4 py-2 text-sm font-medium transition-colors hover:bg-sky/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save rates'}
        </button>
        {message ? <span className="text-xs text-white/60">{message}</span> : null}
      </div>
    </div>
  );
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

  const isAskCitationsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_CITATIONS);
  const isAskRecordToolsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_RECORD_TOOLS);
  const isDueForecastEnabled = useIsFeatureEnabled(FEATURE_KEYS.DUE_FORECAST);
  const isModsEnabled = useIsFeatureEnabled(FEATURE_KEYS.AIRCRAFT_MODIFICATIONS);
  const dueSources = useQuery(
    api.dueForecast.sourcesForProject,
    isDueForecastEnabled && activeProjectId ? { projectId: activeProjectId as never } : 'skip',
  );
  // Soonest forecast item per aircraft for the card-header "Next due" chip.
  const nextDueByAircraft = useMemo(() => {
    const map = new Map<string, DueForecastItem>();
    if (!dueSources) return map;
    const inputs: DueForecastInput[] = [
      ...(dueSources.recurringEntries as DueForecastInput[]),
      ...(dueSources.components as unknown as DueForecastInput[]),
    ];
    const summary = forecastProject(dueSources.aircraft, inputs, new Date());
    for (const item of summary.items) {
      if (!item.aircraftId || item.bucket === 'unforecastable' || typeof item.days !== 'number') continue;
      const existing = map.get(item.aircraftId);
      if (!existing || (existing.days ?? Infinity) > item.days) map.set(item.aircraftId, item);
    }
    return map;
  }, [dueSources]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [timelineIds, setTimelineIds] = useState<Record<string, boolean>>({});
  const [profileTabs, setProfileTabs] = useState<Record<string, 'overview' | 'modifications'>>({});
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
                  {(() => {
                    const nextDue = nextDueByAircraft.get(a._id);
                    if (!nextDue) return null;
                    const tone =
                      nextDue.bucket === 'overdue'
                        ? 'bg-rose-500/20 text-rose-300'
                        : nextDue.bucket === 'due30'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-white/10 text-white/70';
                    return (
                      <span
                        title={nextDue.title}
                        className={`px-2 py-0.5 rounded-full text-xs ${tone}`}
                      >
                        Next: {nextDue.title.slice(0, 28)}
                        {nextDue.title.length > 28 ? '…' : ''} · {dueInText(nextDue)}
                      </span>
                    );
                  })()}
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
                    {isModsEnabled && (
                      <div className="flex gap-1 border-b border-white/10">
                        {(['overview', 'modifications'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setProfileTabs((prev) => ({ ...prev, [a._id]: tab }))}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                              (profileTabs[a._id] ?? 'overview') === tab
                                ? 'bg-white/10 text-white border-b-2 border-sky-light'
                                : 'text-white/60 hover:text-white/85'
                            }`}
                          >
                            {tab === 'overview' ? 'Overview' : 'Modifications'}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Lazy mount: modification queries only run once the tab is selected. */}
                    {isModsEnabled && profileTabs[a._id] === 'modifications' && activeProjectId ? (
                      <div className="mt-4">
                        <ModificationsTab
                          aircraftId={a._id}
                          projectId={activeProjectId}
                          tailNumber={a.tailNumber}
                          make={a.make}
                          model={a.model}
                          serial={a.serial}
                        />
                      </div>
                    ) : (
                    <>
                    <UtilizationRatesEditor aircraft={a} />
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <button
                        type="button"
                        onClick={() => setTimelineIds((prev) => ({ ...prev, [a._id]: !prev[a._id] }))}
                        aria-expanded={!!timelineIds[a._id]}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-white/65">
                          Lifecycle timeline
                        </span>
                        <span className="text-xs text-white/50">{timelineIds[a._id] ? 'Hide ▴' : 'Show ▾'}</span>
                      </button>
                      {/* Lazy mount: the timeline query only runs once opened. */}
                      {timelineIds[a._id] ? (
                        <div className="mt-3">
                          <LifecycleTimeline aircraftId={a._id} />
                        </div>
                      ) : null}
                    </div>
                    {isAskCitationsEnabled && activeProjectId ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">
                          Ask about this aircraft
                        </p>
                        <AskPanel
                          projectId={activeProjectId}
                          scope={{ tailNumber: a.tailNumber }}
                          isDarkMode
                          placeholder={`Ask about ${a.tailNumber}… e.g. "when was the last annual?"`}
                          contextLabel={`Scoped to ${a.tailNumber} — answers cite logbook records and company manuals.`}
                          enableRecordTools={isAskRecordToolsEnabled}
                        />
                      </div>
                    ) : null}
                    {aircraftDiscrepancies.length === 0 ? (
                      <p className="mt-4 text-sm text-white/60">No discrepancies on file.</p>
                    ) : (
                      <ul className="mt-4 divide-y divide-white/5">
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
                    </>
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
