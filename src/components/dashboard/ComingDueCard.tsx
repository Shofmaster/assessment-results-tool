import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { FiCalendar, FiClock, FiRefreshCw, FiSettings, FiTool, FiUpload } from 'react-icons/fi';
import { useQuery } from '../../hooks/useConvexQueryNoThrow';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../../context/ThemeContext';
import { GlassCard } from '../ui';
import DueListImportModal from './DueListImportModal';
import {
  forecastProject,
  dueInText,
  daysBetween,
  parseDateOnly,
  type DueBucket,
  type DueForecastInput,
  type DueForecastItem,
} from '../../utils/dueForecast';
import {
  reconcileDueLists,
  type ExternalDueRow,
  type ReconcilePair,
} from '../../utils/dueListReconcile';
import { dueListProviderLabel, type DueListProvider } from '../../services/dueListImporter';

const SOONEST_LIMIT = 5;

const SOURCE_META: Record<DueForecastItem['source'], { label: string; icon: typeof FiCalendar; path: string }> = {
  schedule: { label: 'Schedule', icon: FiCalendar, path: '/schedule' },
  logbook: { label: 'Logbook', icon: FiClock, path: '/logbook' },
  component: { label: 'Component', icon: FiTool, path: '/fleet' },
};

function bucketChipClass(bucket: DueBucket, isDarkMode: boolean): string {
  switch (bucket) {
    case 'overdue':
      return isDarkMode ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-700';
    case 'due30':
      return isDarkMode ? 'bg-amber-500/20 text-amber-200' : 'bg-amber-100 text-amber-700';
    case 'due60':
      return isDarkMode ? 'bg-sky/20 text-sky-200' : 'bg-sky-100 text-sky-700';
    default:
      return isDarkMode ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-600';
  }
}

/** A display row: a native forecast item, optionally corroborated by a tracker. */
type DueRow = {
  key: string;
  title: string;
  tailNumber?: string;
  days: number;
  bucket: DueBucket;
  dueText: string;
  providerBadge?: string;
  navPath: string;
  icon: typeof FiCalendar;
  stale: boolean;
};

/**
 * "Coming due" forecast card for the Quality Command Center: CAMP-style
 * overdue/30/60/90 buckets across schedule items, recurring logbook entries,
 * life-limited components, and imported tracker rows — reconciled against each
 * other. Display-only by design (no auto-CARs in v1).
 */
export default function ComingDueCard({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [showImport, setShowImport] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [feedMessage, setFeedMessage] = useState<string | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const getOrCreateFeedToken = useMutation(api.calendarFeed.getOrCreateToken);
  const regenerateFeedToken = useMutation(api.calendarFeed.regenerateToken);

  const copyFeedUrl = async (mode: 'get' | 'regenerate') => {
    setFeedBusy(true);
    setFeedMessage(null);
    try {
      const fn = mode === 'regenerate' ? regenerateFeedToken : getOrCreateFeedToken;
      const result = (await fn({ projectId: projectId as never })) as { token: string };
      const url = `${window.location.origin}/api/due-ical?token=${result.token}`;
      await navigator.clipboard.writeText(url);
      setFeedMessage(
        mode === 'regenerate'
          ? 'New feed URL copied — the old link no longer works.'
          : 'Calendar feed URL copied. Subscribe in Outlook/Google Calendar; anyone with this link can see due dates.',
      );
    } catch (err) {
      setFeedMessage(err instanceof Error ? err.message : 'Could not create the feed URL.');
    } finally {
      setFeedBusy(false);
    }
  };

  const heading = isDarkMode ? 'text-white' : 'text-slate-900';
  const subhead = isDarkMode ? 'text-white/45' : 'text-slate-500';
  const muted = isDarkMode ? 'text-white/60' : 'text-slate-600';
  const kpiBg = isDarkMode ? 'bg-white/5' : 'bg-slate-50';
  const rowHover = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100';
  const amber = isDarkMode ? 'text-amber-200/90' : 'text-amber-700';

  const sources = useQuery(
    api.dueForecast.sourcesForProject,
    projectId ? { projectId: projectId as never } : 'skip',
  );

  const computed = useMemo(() => {
    if (!sources) return null;
    const today = new Date();
    const inputs: DueForecastInput[] = [
      ...(sources.scheduleItems as DueForecastInput[]),
      ...(sources.recurringEntries as DueForecastInput[]),
      ...(sources.components as unknown as DueForecastInput[]),
    ];
    const summary = forecastProject(sources.aircraft, inputs, today);

    const externalRows = (sources.externalItems ?? []) as ExternalDueRow[];
    const aircraftTiedNative = summary.items.filter(
      (i) => i.aircraftId && i.bucket !== 'unforecastable',
    );
    const reconcile =
      externalRows.length > 0
        ? reconcileDueLists(aircraftTiedNative, externalRows, summary.rates)
        : null;

    // Provider corroboration per native item (agrees pairs only).
    const corroboration = new Map<string, string>();
    if (reconcile) {
      for (const pair of reconcile.pairs) {
        if (pair.status === 'agrees' && pair.native && pair.external) {
          corroboration.set(
            `${pair.native.source}-${pair.native.sourceId}`,
            dueListProviderLabel(pair.external.provider as DueListProvider),
          );
        }
      }
    }

    const ratesById = new Map(summary.rates.map((r) => [r.aircraftId, r]));
    const rows: DueRow[] = [];
    for (const item of summary.items) {
      if (item.bucket === 'unforecastable' || item.bucket === 'later' || typeof item.days !== 'number') continue;
      const meta = SOURCE_META[item.source];
      rows.push({
        key: `${item.source}-${item.sourceId}`,
        title: item.title,
        tailNumber: item.tailNumber,
        days: item.days,
        bucket: item.bucket,
        dueText: dueInText(item),
        providerBadge: corroboration.get(`${item.source}-${item.sourceId}`),
        navPath: meta.path,
        icon: meta.icon,
        stale: item.stale,
      });
    }
    // Tracker-only rows ("only in CAMP") join the due list with a provider badge.
    if (reconcile) {
      for (const pair of reconcile.pairs) {
        if (pair.status !== 'only_external' || !pair.external) continue;
        const ext = pair.external;
        let days: number | undefined;
        if (ext.nextDueDate) {
          const due = parseDateOnly(ext.nextDueDate);
          if (due) days = daysBetween(today, due);
        } else if (typeof ext.nextDueHours === 'number') {
          const rates = ratesById.get(ext.aircraftId);
          const current = rates?.currentTotals.hours;
          const perDay = rates?.hours?.perDay;
          if (typeof current === 'number' && perDay) {
            days = Math.floor((ext.nextDueHours - current) / perDay);
          }
        }
        if (typeof days !== 'number' || days > 90) continue;
        const bucket: DueBucket = days < 0 ? 'overdue' : days <= 30 ? 'due30' : days <= 60 ? 'due60' : 'due90';
        rows.push({
          key: `external-${ext.sourceId}`,
          title: ext.title,
          tailNumber: ratesById.get(ext.aircraftId)?.tailNumber,
          days,
          bucket,
          dueText: days < 0 ? `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`,
          providerBadge: dueListProviderLabel(ext.provider as DueListProvider),
          navPath: '/fleet',
          icon: FiUpload,
          stale: false,
        });
      }
    }
    rows.sort((a, b) => a.days - b.days);

    const counts: Record<'overdue' | 'due30' | 'due60' | 'due90', number> = {
      overdue: 0,
      due30: 0,
      due60: 0,
      due90: 0,
    };
    for (const row of rows) {
      if (row.bucket in counts) counts[row.bucket as keyof typeof counts] += 1;
    }

    const unforecastable = summary.items.filter((i) => i.bucket === 'unforecastable');
    const needsUtilization = unforecastable.filter((i) => i.reasons.some((r) => r.includes('utilization')));
    return {
      summary,
      rows,
      counts,
      reconcile,
      needsUtilization,
      otherUnforecastable: unforecastable.length - needsUtilization.length,
      forecastableCount: summary.items.length - unforecastable.length,
    };
  }, [sources]);

  if (sources === undefined) {
    return (
      <GlassCard className={`!p-4 ${kpiBg}`}>
        <p className={`text-sm ${muted}`}>Loading due-list forecast…</p>
      </GlassCard>
    );
  }
  if (!computed) return null;

  const { rows, counts, reconcile, needsUtilization, otherUnforecastable } = computed;
  const soonest = rows.slice(0, SOONEST_LIMIT);
  const anyStaleShown = soonest.some((r) => r.stale);
  const staleAsOf = computed.summary.rates.find((r) => r.stale && r.currentTotals.asOfDate)?.currentTotals.asOfDate;
  const mismatchPairs: ReconcilePair[] = reconcile
    ? reconcile.pairs.filter((p) => p.status === 'mismatch')
    : [];
  const onlyAerogapCount = reconcile?.counts.only_aerogap ?? 0;
  const onlyExternalCount = reconcile?.counts.only_external ?? 0;

  const buckets: Array<{ key: keyof typeof counts; label: string; tone: string }> = [
    { key: 'overdue', label: 'Overdue', tone: isDarkMode ? 'text-red-300' : 'text-red-600' },
    { key: 'due30', label: 'Next 30 days', tone: isDarkMode ? 'text-amber-300' : 'text-amber-700' },
    { key: 'due60', label: '31–60 days', tone: isDarkMode ? 'text-sky-300' : 'text-sky-700' },
    { key: 'due90', label: '61–90 days', tone: isDarkMode ? 'text-white/70' : 'text-slate-600' },
  ];

  return (
    <GlassCard className={`!p-4 ${kpiBg}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FiClock className={isDarkMode ? 'text-amber-300' : 'text-amber-700'} />
          <span className={`text-sm font-semibold ${heading}`}>Coming due</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => copyFeedUrl('get')}
            disabled={feedBusy}
            title="Copy a calendar-subscription URL for this due list"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
              isDarkMode
                ? 'border-white/20 text-white/75 hover:bg-white/5'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FiCalendar aria-hidden /> Calendar feed
          </button>
          <button
            type="button"
            onClick={() => copyFeedUrl('regenerate')}
            disabled={feedBusy}
            title="Revoke the current feed URL and copy a new one"
            aria-label="Regenerate calendar feed URL"
            className={`inline-flex items-center rounded-lg border p-1.5 transition-colors disabled:opacity-50 ${
              isDarkMode
                ? 'border-white/20 text-white/60 hover:bg-white/5'
                : 'border-slate-300 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <FiRefreshCw className="text-[11px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              isDarkMode
                ? 'border-white/20 text-white/75 hover:bg-white/5'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FiUpload aria-hidden /> Import tracker report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {buckets.map((bucket) => (
          <div key={bucket.key} className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
            <div className={`text-2xl font-display font-bold ${bucket.tone}`}>{counts[bucket.key]}</div>
            <p className={`text-[11px] ${subhead}`}>{bucket.label}</p>
          </div>
        ))}
      </div>

      {importMessage ? <p className={`mt-2 text-xs ${muted}`}>{importMessage}</p> : null}
      {feedMessage ? <p className={`mt-2 text-xs ${muted}`}>{feedMessage}</p> : null}

      {soonest.length > 0 ? (
        <ul className="mt-3 space-y-0.5">
          {soonest.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => navigate(row.navPath)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${rowHover}`}
                >
                  <Icon className={`shrink-0 text-xs ${subhead}`} aria-hidden />
                  <span className={`min-w-0 flex-1 truncate text-xs ${muted}`} title={row.title}>
                    {row.title}
                    {row.tailNumber ? <span className={`ml-1.5 ${subhead}`}>{row.tailNumber}</span> : null}
                    {row.providerBadge ? (
                      <span
                        className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          isDarkMode ? 'bg-white/10 text-white/60' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {row.providerBadge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${bucketChipClass(row.bucket, isDarkMode)}`}
                  >
                    {row.dueText}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`mt-3 text-xs ${subhead}`}>Nothing due in the next 90 days.</p>
      )}

      {reconcile && (mismatchPairs.length > 0 || onlyExternalCount > 0 || onlyAerogapCount > 0) ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowReconcile((p) => !p)}
            className={`text-[11px] font-medium underline-offset-2 hover:underline ${amber}`}
          >
            Tracker reconciliation: {mismatchPairs.length} mismatch{mismatchPairs.length === 1 ? '' : 'es'} ·{' '}
            {onlyExternalCount} only in tracker · {onlyAerogapCount} only in AeroGap — review
          </button>
          {showReconcile ? (
            <ul className={`mt-1.5 space-y-1 rounded-lg border px-3 py-2 text-[11px] ${
              isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
            }`}>
              {mismatchPairs.map((pair, i) => (
                <li key={`mm-${i}`} className={muted}>
                  <span className={`mr-1 font-semibold ${amber}`}>Mismatch:</span>
                  {pair.native?.title}
                  {pair.native?.tailNumber ? ` (${pair.native.tailNumber})` : ''} — {pair.note}
                </li>
              ))}
              {reconcile.pairs
                .filter((p) => p.status === 'only_aerogap')
                .slice(0, 5)
                .map((pair, i) => (
                  <li key={`oa-${i}`} className={muted}>
                    <span className="mr-1 font-semibold">Only in AeroGap:</span>
                    {pair.native?.title}
                    {pair.native?.tailNumber ? ` (${pair.native.tailNumber})` : ''}
                  </li>
                ))}
              {onlyAerogapCount > 5 ? (
                <li className={subhead}>…and {onlyAerogapCount - 5} more only-in-AeroGap items</li>
              ) : null}
              <li className={subhead}>
                Review-only comparison — tolerances ±3 days / ±5 hours. Nothing is changed automatically.
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}

      {anyStaleShown && staleAsOf ? (
        <p className={`mt-2 text-[11px] ${amber}`}>
          Aircraft times as of {staleAsOf} — sync or update utilization for current forecasts.
        </p>
      ) : null}

      {needsUtilization.length > 0 || otherUnforecastable > 0 ? (
        <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${subhead}`}>
          {needsUtilization.length > 0 ? (
            <button
              type="button"
              onClick={() => navigate('/fleet')}
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              <FiSettings aria-hidden /> {needsUtilization.length} item
              {needsUtilization.length === 1 ? '' : 's'} need utilization data
            </button>
          ) : null}
          {otherUnforecastable > 0 ? (
            <button
              type="button"
              onClick={() => navigate('/schedule')}
              className="underline-offset-2 hover:underline"
            >
              {otherUnforecastable} item{otherUnforecastable === 1 ? '' : 's'} missing dates/intervals
            </button>
          ) : null}
        </div>
      ) : null}

      {showImport && sources ? (
        <DueListImportModal
          projectId={projectId}
          aircraft={sources.aircraft.map((a: { aircraftId: string; tailNumber: string }) => ({
            _id: a.aircraftId,
            tailNumber: a.tailNumber,
          }))}
          isDarkMode={isDarkMode}
          onClose={() => setShowImport(false)}
          onImported={({ inserted, provider }) =>
            setImportMessage(`Imported ${inserted} items from ${dueListProviderLabel(provider)}.`)
          }
        />
      ) : null}
    </GlassCard>
  );
}
