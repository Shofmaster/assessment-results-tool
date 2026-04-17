import { useState, useMemo } from 'react';
import { useQuery } from '../hooks/useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';
import {
  useLogbookEntries,
  useDocuments,
} from '../hooks/useConvexData';
import {
  type LogbookEntry,
  type LogbookGapWarning,
  type LogbookContinuityWarning,
} from '../types/logbook';
import {
  filterEntriesByLocation,
  compareEntryDate,
  groupEntriesByType,
  daysBetween,
  type ArrangeBy,
  type EntryLocation,
} from '../utils/logbookUtils';
import {
  FiAlertTriangle,
  FiClock,
  FiLayers,
} from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

const LOGBOOK_COLORS = ['#0369a1', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];

export default function LogbookTimelineTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const documents = (useDocuments(projectId, 'logbook') ?? []) as any[];
  const [arrangeBy, setArrangeBy] = useState<ArrangeBy>('date_asc');
  const [locationFilter, setLocationFilter] = useState<EntryLocation>('full');
  const [gapThreshold, setGapThreshold] = useState(90);
  const [multiLogbookView, setMultiLogbookView] = useState(false);
  const [crossCheckThreshold, setCrossCheckThreshold] = useState(5);

  const gaps = (useQuery(
    (api as any).logbookEntries.detectGaps,
    { projectId: projectId as any, aircraftId: aircraftId as any, thresholdDays: gapThreshold }
  ) ?? []) as LogbookGapWarning[];

  const continuityWarnings = (useQuery(
    (api as any).logbookEntries.checkContinuity,
    { projectId: projectId as any, aircraftId: aircraftId as any }
  ) ?? []) as LogbookContinuityWarning[];

  const gapMap = useMemo(() => {
    const m = new Map<string, LogbookGapWarning>();
    for (const g of gaps) m.set(g.beforeEntryId, g);
    return m;
  }, [gaps]);

  const continuityMap = useMemo(() => {
    const m = new Map<string, LogbookContinuityWarning>();
    for (const w of continuityWarnings) m.set(w.entryId, w);
    return m;
  }, [continuityWarnings]);

  const locationFiltered = useMemo(
    () => filterEntriesByLocation(entries, locationFilter),
    [entries, locationFilter]
  );

  const sorted = useMemo(() => {
    const dated = [...locationFiltered].filter((e) => e.entryDate);
    if (arrangeBy === 'date_desc') return dated.sort((a, b) => compareEntryDate(a, b, 'desc'));
    return dated.sort((a, b) => compareEntryDate(a, b, 'asc'));
  }, [arrangeBy, locationFiltered]);

  const grouped = useMemo(() => {
    if (arrangeBy !== 'type_sections') return [];
    return groupEntriesByType(locationFiltered.filter((e) => e.entryDate), 'asc');
  }, [arrangeBy, locationFiltered]);

  const chartData = useMemo(() => {
    return entries
      .filter((e) => e.entryDate && e.totalTimeAtEntry !== undefined)
      .sort((a, b) => a.entryDate!.localeCompare(b.entryDate!))
      .map((e) => ({ label: e.entryDate!.slice(0, 7), hours: e.totalTimeAtEntry! }));
  }, [entries]);

  // ── Multi-logbook support ─────────────────────────────────────────────────

  const docNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const doc of documents) m.set(doc._id, doc.name as string);
    return m;
  }, [documents]);

  const docGroups = useMemo(() => {
    const groups = new Map<string, LogbookEntry[]>();
    for (const entry of entries) {
      const key = entry.sourceDocumentId ?? '__unknown__';
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return groups;
  }, [entries]);

  const docIds = useMemo(() => [...docGroups.keys()], [docGroups]);

  const multiChartData = useMemo(() => {
    if (!multiLogbookView || docGroups.size <= 1) return [];
    const allMonths = new Set<string>();
    for (const [, docEntries] of docGroups) {
      for (const e of docEntries) {
        if (e.entryDate && e.totalTimeAtEntry !== undefined) allMonths.add(e.entryDate.slice(0, 7));
      }
    }
    const sortedMonths = [...allMonths].sort();
    return sortedMonths.map((month) => {
      const point: Record<string, string | number | undefined> = { date: month };
      for (const [docId, docEntries] of docGroups) {
        const relevant = docEntries
          .filter((e) => e.entryDate && e.entryDate.slice(0, 7) <= month && e.totalTimeAtEntry !== undefined)
          .sort((a, b) => b.entryDate!.localeCompare(a.entryDate!));
        if (relevant.length > 0) point[docId] = relevant[0].totalTimeAtEntry;
      }
      return point;
    });
  }, [multiLogbookView, docGroups]);

  const crossLogbookDiscrepancies = useMemo(() => {
    if (docIds.length < 2) return [];
    const results: Array<{
      dateA: string; ttA: number; docAId: string;
      dateB: string; ttB: number; docBId: string;
      ttDiff: number; daysDiff: number;
    }> = [];
    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const aEntries = (docGroups.get(docIds[i]) ?? []).filter((e) => e.entryDate && e.totalTimeAtEntry !== undefined);
        const bEntries = (docGroups.get(docIds[j]) ?? []).filter((e) => e.entryDate && e.totalTimeAtEntry !== undefined);
        for (const eA of aEntries) {
          for (const eB of bEntries) {
            const dDiff = Math.abs(daysBetween(eA.entryDate!, eB.entryDate!));
            if (dDiff > 14) continue;
            const ttDiff = Math.abs(eA.totalTimeAtEntry! - eB.totalTimeAtEntry!);
            if (ttDiff >= crossCheckThreshold) {
              results.push({ dateA: eA.entryDate!, ttA: eA.totalTimeAtEntry!, docAId: docIds[i], dateB: eB.entryDate!, ttB: eB.totalTimeAtEntry!, docBId: docIds[j], ttDiff, daysDiff: dDiff });
            }
          }
        }
      }
    }
    // Deduplicate by keeping one per unique (docA, docB, approximate date range)
    const seen = new Set<string>();
    return results.filter((r) => {
      const key = `${r.docAId}-${r.docBId}-${r.dateA.slice(0, 7)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => b.ttDiff - a.ttDiff);
  }, [docIds, docGroups, crossCheckThreshold]);

  if (arrangeBy === 'type_sections' ? grouped.length === 0 : sorted.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        <FiClock className="text-3xl mx-auto mb-2" />
        <p className="text-sm">No dated entries to display. Parse logbook documents to build the timeline.</p>
      </div>
    );
  }

  // showGaps only makes sense in chronological ascending order
  const showGaps = arrangeBy === 'date_asc';

  const renderTimelineRows = (timelineEntries: LogbookEntry[], withGaps = false) => {
    let prevTime: number | undefined;
    const rows: JSX.Element[] = [];

    for (const entry of timelineEntries) {
      const timeDelta =
        prevTime !== undefined && entry.totalTimeAtEntry !== undefined
          ? entry.totalTimeAtEntry - prevTime
          : undefined;
      prevTime = entry.totalTimeAtEntry;

      const continuityWarning = continuityMap.get(entry._id);
      const gapAfterEntry = withGaps ? gapMap.get(entry._id) : undefined;

      const docId = entry.sourceDocumentId ?? '__unknown__';
      const docIdx = docIds.indexOf(docId);
      const docColor = multiLogbookView && docIdx >= 0 ? LOGBOOK_COLORS[docIdx % LOGBOOK_COLORS.length] : undefined;
      const docLabel = docId !== '__unknown__' ? (docNameMap.get(docId) ?? docId) : 'Unknown';
      const shortDocLabel = docLabel.length > 16 ? docLabel.slice(0, 16) + '…' : docLabel;

      rows.push(
        <div
          key={entry._id}
          className={`grid gap-2 items-start px-3 py-2 hover:bg-amber-50/60 rounded text-xs ${multiLogbookView ? 'grid-cols-[80px_120px_1fr_90px_70px_70px]' : 'grid-cols-[80px_1fr_90px_70px_70px]'} ${continuityWarning ? 'bg-red-50/60' : ''}`}
          style={docColor ? { borderLeft: `3px solid ${docColor}` } : undefined}
        >
          <span className="text-stone-700 font-mono">{entry.entryDate}</span>
          {multiLogbookView && (
            <span className="text-[10px] truncate font-medium" style={{ color: docColor ?? '#78716c' }} title={docLabel}>
              {shortDocLabel}
            </span>
          )}
          <span className="min-w-0">
            <span className="text-stone-800 truncate block font-['Source_Serif_4',serif]">
              {entry.workPerformed ?? entry.rawText.slice(0, 80)}
            </span>
            {continuityWarning && (
              <span
                className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 border border-red-300 font-semibold"
                title={`Total time ${continuityWarning.deltaHours < 0 ? 'decreased' : 'jumped'} from ${continuityWarning.previousTotalTime} to ${continuityWarning.currentTotalTime} hrs`}
              >
                <FiAlertTriangle className="text-[10px]" />
                TT {continuityWarning.deltaHours < 0 ? '↓' : '↑'} {Math.abs(continuityWarning.deltaHours).toFixed(1)} hrs
              </span>
            )}
          </span>
          <span className="text-right text-stone-600 font-mono tabular-nums">
            {entry.totalTimeAtEntry ?? '—'}
            {timeDelta !== undefined && timeDelta > 0 && (
              <span className="text-sky-700 ml-1">(+{timeDelta.toFixed(1)})</span>
            )}
          </span>
          <span className="text-right text-stone-600 font-mono tabular-nums">{entry.totalCyclesAtEntry ?? '—'}</span>
          <span className="text-right text-stone-600 font-mono tabular-nums">{entry.totalLandingsAtEntry ?? '—'}</span>
        </div>
      );

      if (gapAfterEntry) {
        rows.push(
          <div
            key={`gap-${entry._id}`}
            className="flex items-center gap-2 mx-1 my-0.5 px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-100 text-xs text-amber-900"
          >
            <FiAlertTriangle className="text-amber-600 flex-shrink-0" />
            <span className="font-semibold">{gapAfterEntry.gapDays}-day gap</span>
            <span className="text-amber-700">
              {gapAfterEntry.beforeDate} → {gapAfterEntry.afterDate}
            </span>
          </div>
        );
      }
    }

    return rows;
  };

  return (
    <div className="space-y-3 text-stone-800">
      {/* Total Time Progression Chart */}
      {(chartData.length >= 2 || multiChartData.length >= 2) && (
        <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] px-4 pt-3 pb-2 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">Total Time Progression</p>
            {docIds.length > 1 && (
              <button
                type="button"
                onClick={() => setMultiLogbookView((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                  multiLogbookView
                    ? 'bg-sky-700 text-white border-sky-900'
                    : 'bg-[#fff8eb] text-stone-700 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <FiLayers className="text-xs" />
                {multiLogbookView ? `Multi-Logbook (${docIds.length})` : 'Multi-Logbook View'}
              </button>
            )}
          </div>
          {multiLogbookView && multiChartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={multiChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#78716c' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#78716c' }} width={52} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: '#fffdf7', border: '1px solid #d97706', borderRadius: 6 }}
                  formatter={(val, name) => [
                    typeof val === 'number' ? `${val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs` : String(val),
                    docNameMap.get(String(name)) ?? String(name),
                  ]}
                  labelStyle={{ color: '#57534e', fontWeight: 600 }}
                />
                <Legend
                  formatter={(value) => {
                    const name = docNameMap.get(value) ?? value;
                    return <span style={{ fontSize: 10 }}>{name.length > 24 ? name.slice(0, 24) + '…' : name}</span>;
                  }}
                />
                {docIds.map((docId, idx) => (
                  <Line
                    key={docId}
                    type="monotone"
                    dataKey={docId}
                    stroke={LOGBOOK_COLORS[idx % LOGBOOK_COLORS.length]}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ttGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0369a1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0369a1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#78716c' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#78716c' }} width={52} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: '#fffdf7', border: '1px solid #d97706', borderRadius: 6 }}
                  formatter={(val) => [typeof val === 'number' ? `${val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs` : String(val), 'Total Time']}
                  labelStyle={{ color: '#57534e', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="hours" stroke="#0369a1" fill="url(#ttGradient)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Cross-logbook consistency panel */}
      {multiLogbookView && crossLogbookDiscrepancies.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <FiAlertTriangle />
              {crossLogbookDiscrepancies.length} Cross-Logbook Total-Time Discrepanc{crossLogbookDiscrepancies.length > 1 ? 'ies' : 'y'}
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <label className="whitespace-nowrap">Threshold (hrs):</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={crossCheckThreshold}
                onChange={(e) => setCrossCheckThreshold(Math.max(0.5, parseFloat(e.target.value) || 5))}
                className="w-14 rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-stone-800 focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            {crossLogbookDiscrepancies.map((d, i) => {
              const nameA = docNameMap.get(d.docAId) ?? d.docAId;
              const nameB = docNameMap.get(d.docBId) ?? d.docBId;
              const colorA = LOGBOOK_COLORS[docIds.indexOf(d.docAId) % LOGBOOK_COLORS.length];
              const colorB = LOGBOOK_COLORS[docIds.indexOf(d.docBId) % LOGBOOK_COLORS.length];
              return (
                <div key={i} className="flex flex-wrap items-start gap-3 rounded border border-red-200 bg-white px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-stone-700">{d.dateA}</span>
                      <span style={{ color: colorA }} className="font-semibold truncate max-w-[120px]" title={nameA}>{nameA.length > 18 ? nameA.slice(0, 18) + '…' : nameA}</span>
                      <span className="text-stone-500">TT:</span>
                      <span className="font-mono font-bold text-stone-800">{d.ttA.toFixed(1)} hrs</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="font-mono font-bold text-stone-700">{d.dateB}</span>
                      <span style={{ color: colorB }} className="font-semibold truncate max-w-[120px]" title={nameB}>{nameB.length > 18 ? nameB.slice(0, 18) + '…' : nameB}</span>
                      <span className="text-stone-500">TT:</span>
                      <span className="font-mono font-bold text-stone-800">{d.ttB.toFixed(1)} hrs</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-red-700 tabular-nums">Δ {d.ttDiff.toFixed(1)} hrs</div>
                    {d.daysDiff > 0 && <div className="text-stone-400 tabular-nums">{d.daysDiff}d apart</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warning summary banners */}
      {(gaps.length > 0 || continuityWarnings.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {gaps.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-100 text-xs text-amber-900 font-semibold">
              <FiAlertTriangle />
              {gaps.length} gap{gaps.length > 1 ? 's' : ''} &gt; {gapThreshold} days
            </div>
          )}
          {continuityWarnings.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-400 bg-red-50 text-xs text-red-800 font-semibold">
              <FiAlertTriangle />
              {continuityWarnings.length} total-time inconsistenc{continuityWarnings.length > 1 ? 'ies' : 'y'}
            </div>
          )}
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
          <span className="px-2 text-stone-500">Location</span>
          {([
            ['full', 'Full Logbook'],
            ['ad', 'ADs'],
            ['sb', 'SBs'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocationFilter(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                locationFilter === value ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
          <span className="px-2 text-stone-500">Arrange</span>
          {([
            ['date_desc', 'Newest first'],
            ['date_asc', 'Oldest first'],
            ['type_sections', 'By entry type'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setArrangeBy(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                arrangeBy === value ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-stone-600">
          <label htmlFor="gapThreshold" className="whitespace-nowrap">
            Gap threshold (days):
          </label>
          <input
            id="gapThreshold"
            type="number"
            min="1"
            max="3650"
            value={gapThreshold}
            onChange={(e) => setGapThreshold(Math.max(1, parseInt(e.target.value, 10) || 90))}
            className="w-16 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Column headers */}
      <div className={`grid gap-2 text-[10px] text-stone-600 font-semibold uppercase px-3 pb-2 border-b border-amber-300 ${multiLogbookView ? 'grid-cols-[80px_120px_1fr_90px_70px_70px]' : 'grid-cols-[80px_1fr_90px_70px_70px]'}`}>
        <span>Date</span>
        {multiLogbookView && <span>Source</span>}
        <span>Work Performed</span>
        <span className="text-right">TT (hrs)</span>
        <span className="text-right">Cycles</span>
        <span className="text-right">Landings</span>
      </div>

      {arrangeBy === 'type_sections' ? (
        <div className="space-y-4">
          {grouped.map((section) => (
            <section
              key={section.key}
              className="rounded-lg border border-amber-300/80 bg-[#fffdf7] shadow-sm p-2"
            >
              <h3 className="px-2 pb-2 text-xs uppercase tracking-wide text-stone-700 font-semibold">
                {section.label}
              </h3>
              <div className="space-y-1">{renderTimelineRows(section.entries, false)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-1 rounded-lg border border-amber-300/80 bg-[#fffdf7] p-2 shadow-sm">
          {renderTimelineRows(sorted, showGaps)}
        </div>
      )}
    </div>
  );
}
