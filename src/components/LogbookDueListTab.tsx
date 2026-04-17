import { useState, useMemo } from 'react';
import { FiList, FiFilter, FiCalendar } from 'react-icons/fi';
import {
  useLogbookEntries,
  useAircraftComponents,
} from '../hooks/useConvexData';
import {
  getLogbookEntryTypeLabel,
  type AircraftAsset,
  type LogbookEntry,
  type AircraftComponent,
} from '../types/logbook';
import { daysBetween } from '../utils/logbookUtils';

type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'unknown';
type DueCategory = 'AD' | 'SB' | 'Inspection' | 'Regulatory Check' | 'Component Life' | 'Other';

interface DueItem {
  id: string;
  title: string;
  category: DueCategory;
  referenceNumber?: string;
  lastPerformedDate?: string;
  lastPerformedTT?: number;
  /** Calendar due date (ISO string) */
  dueDate?: string;
  /** Aircraft TT at which this item is due */
  dueAtHours?: number;
  hoursRemaining?: number;
  daysRemaining?: number;
  status: DueStatus;
  sourceEntryId?: string;
  sourceComponentId?: string;
  notes?: string;
}

function addCalendarMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function computeDueStatus(item: Omit<DueItem, 'status'>, today: string, currentTT: number): DueStatus {
  let hoursBased = false;
  let dateBased = false;

  if (item.dueAtHours !== undefined) {
    hoursBased = true;
    const rem = item.dueAtHours - currentTT;
    if (rem < 0) return 'overdue';
    if (rem <= 50) return 'due_soon';
  }
  if (item.dueDate) {
    dateBased = true;
    const days = daysBetween(today, item.dueDate);
    if (days < 0) return 'overdue';
    if (days <= 30) return 'due_soon';
  }
  if (!hoursBased && !dateBased) return 'unknown';
  return 'ok';
}

function buildDueItems(entries: LogbookEntry[], components: AircraftComponent[], currentTT: number): DueItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const items: DueItem[] = [];

  // ── 1. Inspection entries: deduplicate by inspectionType, use latest ──────
  const latestByInspectionType = new Map<string, LogbookEntry>();
  for (const e of entries) {
    if (e.inspectionType) {
      const existing = latestByInspectionType.get(e.inspectionType);
      if (!existing || (e.entryDate ?? '') > (existing.entryDate ?? '')) {
        latestByInspectionType.set(e.inspectionType, e);
      }
    }
  }
  for (const [type, entry] of latestByInspectionType) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    const label =
      type === 'annual' ? 'Annual Inspection'
      : type === '100_hour' ? '100-Hour Inspection'
      : type === 'progressive' ? 'Progressive Inspection'
      : type === 'condition' ? 'Condition Inspection'
      : type === 'phase' ? 'Phase Inspection'
      : type === 'ica' ? 'ICA Inspection'
      : type === 'conformity' ? 'Conformity Inspection'
      : type === 'pre_purchase' ? 'Pre-Purchase Inspection'
      : 'Inspection';

    if (entry.nextDueDate) {
      dueDate = entry.nextDueDate;
    } else if (entry.recurrenceInterval && entry.recurrenceUnit && entry.entryDate) {
      if (entry.recurrenceUnit === 'calendar_months') {
        dueDate = addCalendarMonths(entry.entryDate, entry.recurrenceInterval);
      } else if (entry.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + entry.recurrenceInterval;
      }
    } else if (type === 'annual' && entry.entryDate) {
      dueDate = addCalendarMonths(entry.entryDate, 12);
    } else if (type === '100_hour' && entry.totalTimeAtEntry !== undefined) {
      dueAtHours = entry.totalTimeAtEntry + 100;
    } else if (type === 'condition' && entry.entryDate) {
      dueDate = addCalendarMonths(entry.entryDate, 12);
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `insp-${type}`,
      title: label,
      category: 'Inspection',
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 2. Regulatory checks: deduplicate by regulatoryBasis ────────────────
  const latestByRegBasis = new Map<string, LogbookEntry>();
  for (const e of entries) {
    if (e.entryType === 'regulatory_check' && e.regulatoryBasis) {
      const existing = latestByRegBasis.get(e.regulatoryBasis);
      if (!existing || (e.entryDate ?? '') > (existing.entryDate ?? '')) {
        latestByRegBasis.set(e.regulatoryBasis, e);
      }
    }
  }
  for (const [basis, entry] of latestByRegBasis) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    if (entry.nextDueDate) {
      dueDate = entry.nextDueDate;
    } else if (entry.recurrenceInterval && entry.recurrenceUnit && entry.entryDate) {
      if (entry.recurrenceUnit === 'calendar_months') {
        dueDate = addCalendarMonths(entry.entryDate, entry.recurrenceInterval);
      } else if (entry.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + entry.recurrenceInterval;
      }
    } else if (entry.entryDate) {
      // Default FAA recurrence intervals for known checks
      const defaultMonths: Record<string, number> = { '91.413': 24, '91.411': 24, '91.207': 12 };
      const months = defaultMonths[basis];
      if (months) dueDate = addCalendarMonths(entry.entryDate, months);
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `regcheck-${basis}`,
      title: `${basis} Check`,
      category: 'Regulatory Check',
      referenceNumber: `14 CFR §${basis}`,
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 3. Recurring AD compliance: deduplicate by adNumber ─────────────────
  const latestAdEntry = new Map<string, { entry: LogbookEntry; detail: typeof entries[0]['adComplianceDetails'] extends (infer T)[] | undefined ? T : never }>();
  for (const e of entries) {
    for (const ad of e.adComplianceDetails ?? []) {
      if (ad.complianceMethod !== 'recurring') continue;
      const existing = latestAdEntry.get(ad.adNumber);
      if (!existing || (e.entryDate ?? '') > (existing.entry.entryDate ?? '')) {
        latestAdEntry.set(ad.adNumber, { entry: e, detail: ad });
      }
    }
  }
  for (const [adNumber, { entry, detail }] of latestAdEntry) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    if (detail.nextDueHint) {
      // nextDueHint is free text — use as notes; also try to parse as a date
      const parsedDate = detail.nextDueHint.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      if (parsedDate) dueDate = parsedDate;
    }
    if (!dueDate && !dueAtHours && detail.recurrenceInterval && detail.recurrenceUnit) {
      if (detail.recurrenceUnit === 'calendar_months' && entry.entryDate) {
        dueDate = addCalendarMonths(entry.entryDate, detail.recurrenceInterval);
      } else if (detail.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + detail.recurrenceInterval;
      }
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `ad-${adNumber}`,
      title: `AD ${adNumber}`,
      category: 'AD',
      referenceNumber: adNumber,
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
      notes: detail.nextDueHint,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 4. Recurring SB compliance: deduplicate by sbNumber ─────────────────
  const latestSbEntry = new Map<string, { entry: LogbookEntry; detail: typeof entries[0]['sbComplianceDetails'] extends (infer T)[] | undefined ? T : never }>();
  for (const e of entries) {
    for (const sb of e.sbComplianceDetails ?? []) {
      if (!sb.recurrenceInterval) continue;
      const existing = latestSbEntry.get(sb.sbNumber);
      if (!existing || (e.entryDate ?? '') > (existing.entry.entryDate ?? '')) {
        latestSbEntry.set(sb.sbNumber, { entry: e, detail: sb });
      }
    }
  }
  for (const [sbNumber, { entry, detail }] of latestSbEntry) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    if (detail.recurrenceInterval && detail.recurrenceUnit) {
      if (detail.recurrenceUnit === 'calendar_months' && entry.entryDate) {
        dueDate = addCalendarMonths(entry.entryDate, detail.recurrenceInterval);
      } else if (detail.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + detail.recurrenceInterval;
      }
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `sb-${sbNumber}`,
      title: `SB ${sbNumber}`,
      category: 'SB',
      referenceNumber: sbNumber,
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 5. Top-level nextDueDate on entries (not already captured above) ─────
  for (const e of entries) {
    if (!e.nextDueDate) continue;
    if (e.inspectionType || e.entryType === 'regulatory_check') continue; // already handled
    if ((e.adComplianceDetails?.length ?? 0) > 0 || (e.sbComplianceDetails?.length ?? 0) > 0) continue;

    const partial: Omit<DueItem, 'status'> = {
      id: `entry-due-${e._id}`,
      title: e.workPerformed?.slice(0, 60) ?? getLogbookEntryTypeLabel(e.entryType),
      category: e.entryType === 'ad_compliance' ? 'AD' : e.entryType === 'sb_compliance' ? 'SB' : 'Other',
      lastPerformedDate: e.entryDate,
      lastPerformedTT: e.totalTimeAtEntry,
      dueDate: e.nextDueDate,
      daysRemaining: daysBetween(today, e.nextDueDate),
      sourceEntryId: e._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 6. Life-limited components ───────────────────────────────────────────
  for (const comp of components) {
    if (!comp.isLifeLimited || !comp.lifeLimit) continue;
    if (comp.lifeLimitUnit !== 'hours') {
      // Non-hour life limits — show as unknown (manual check)
      items.push({
        id: `comp-${comp._id}`,
        title: comp.description,
        category: 'Component Life',
        referenceNumber: comp.partNumber,
        lastPerformedDate: comp.installDate,
        dueAtHours: undefined,
        status: 'unknown',
        sourceComponentId: comp._id,
        notes: `Life limit: ${comp.lifeLimit} ${comp.lifeLimitUnit ?? 'units'} — manual check required`,
      });
      continue;
    }
    const tsnAtInstall = comp.tsnAtInstall ?? 0;
    const timeAtInstall = comp.aircraftTimeAtInstall ?? 0;
    const usedSinceInstall = Math.max(0, currentTT - timeAtInstall);
    const currentTSN = tsnAtInstall + usedSinceInstall;
    const hoursRemaining = comp.lifeLimit - currentTSN;
    const dueAtHours = currentTT + hoursRemaining;

    const partial: Omit<DueItem, 'status'> = {
      id: `comp-${comp._id}`,
      title: comp.description,
      category: 'Component Life',
      referenceNumber: `P/N ${comp.partNumber}${comp.serialNumber ? ` S/N ${comp.serialNumber}` : ''}`,
      lastPerformedDate: comp.installDate,
      lastPerformedTT: comp.aircraftTimeAtInstall,
      dueAtHours,
      hoursRemaining,
      sourceComponentId: comp._id,
      notes: `Life limit: ${comp.lifeLimit} hrs · Current TSN: ${currentTSN.toFixed(1)} hrs`,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  return items;
}

const DUE_STATUS_ORDER: DueStatus[] = ['overdue', 'due_soon', 'ok', 'unknown'];
const CATEGORY_ORDER: DueCategory[] = ['Inspection', 'AD', 'SB', 'Regulatory Check', 'Component Life', 'Other'];

export default function LogbookDueListTab({
  projectId,
  aircraftId,
  currentTT,
  aircraft,
}: {
  projectId: string;
  aircraftId: string;
  currentTT: number;
  aircraft?: AircraftAsset;
}) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const components = (useAircraftComponents(projectId, aircraftId, 'installed') ?? []) as AircraftComponent[];

  const [statusFilter, setStatusFilter] = useState<DueStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<DueCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'status' | 'category' | 'due_date'>('status');

  const allItems = useMemo(() => buildDueItems(entries, components, currentTT), [entries, components, currentTT]);

  const filtered = useMemo(() => {
    let result = allItems;
    if (statusFilter !== 'all') result = result.filter((i) => i.status === statusFilter);
    if (categoryFilter !== 'all') result = result.filter((i) => i.category === categoryFilter);
    return result;
  }, [allItems, statusFilter, categoryFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'status') {
        const si = DUE_STATUS_ORDER.indexOf(a.status) - DUE_STATUS_ORDER.indexOf(b.status);
        if (si !== 0) return si;
      }
      if (sortBy === 'category') {
        const ci = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (ci !== 0) return ci;
      }
      // Secondary: sort by due soonest (hours then date)
      const aHrs = a.hoursRemaining ?? a.daysRemaining ?? Infinity;
      const bHrs = b.hoursRemaining ?? b.daysRemaining ?? Infinity;
      return aHrs - bHrs;
    });
  }, [filtered, sortBy]);

  const counts = useMemo(() => ({
    overdue: allItems.filter((i) => i.status === 'overdue').length,
    due_soon: allItems.filter((i) => i.status === 'due_soon').length,
    ok: allItems.filter((i) => i.status === 'ok').length,
    unknown: allItems.filter((i) => i.status === 'unknown').length,
  }), [allItems]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        <FiList className="text-3xl mx-auto mb-2" />
        <p className="text-sm">No logbook entries yet. Parse logbook documents to build the due list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-stone-800">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {([
          ['overdue', 'Overdue', 'bg-red-100 border-red-300 text-red-800'],
          ['due_soon', 'Due Soon', 'bg-amber-100 border-amber-300 text-amber-800'],
          ['ok', 'OK', 'bg-green-100 border-green-300 text-green-700'],
          ['unknown', 'Manual Check', 'bg-stone-100 border-stone-300 text-stone-600'],
        ] as const).map(([status, label, cls]) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${cls} ${statusFilter === status ? 'ring-2 ring-offset-1 ring-stone-400' : 'opacity-80 hover:opacity-100'}`}
          >
            {label}
            <span className="ml-1 font-bold">{counts[status]}</span>
          </button>
        ))}
      </div>

      {/* Filters + sort */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1">
          <FiFilter className="ml-1 text-stone-500" />
          <span className="px-1 text-stone-500">Category</span>
          {(['all', ...CATEGORY_ORDER] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md px-2.5 py-1 transition-colors ${categoryFilter === cat ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'}`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1">
          <span className="px-2 text-stone-500">Sort</span>
          {([['status', 'By urgency'], ['category', 'By category'], ['due_date', 'By due date']] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setSortBy(val)}
              className={`rounded-md px-2.5 py-1 transition-colors ${sortBy === val ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-stone-500">{sorted.length} item{sorted.length !== 1 ? 's' : ''}{statusFilter !== 'all' || categoryFilter !== 'all' ? ' (filtered)' : ''}</span>
      </div>

      {/* Due items */}
      {sorted.length === 0 ? (
        <div className="text-center py-8 text-stone-500 text-sm">No items match the selected filters.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <DueItemCard key={item.id} item={item} currentTT={currentTT} />
          ))}
        </div>
      )}

      {/* Horizon summary */}
      <div className="rounded-lg border border-amber-300/70 bg-[#fffdf7] p-4 text-xs text-stone-600 space-y-1">
        <div className="font-semibold text-stone-700 mb-2 flex items-center gap-1.5"><FiCalendar /> Maintenance Horizon</div>
        {[30, 90, 180, 365].map((days) => {
          const n = allItems.filter((i) => {
            if (i.status === 'overdue') return true;
            if (i.daysRemaining !== undefined && i.daysRemaining <= days) return true;
            if (i.hoursRemaining !== undefined && currentTT > 0) {
              // rough: assume 1 hr/day utilization as a proxy
              return i.hoursRemaining <= days;
            }
            return false;
          }).length;
          return (
            <div key={days} className="flex items-center justify-between">
              <span>Due within {days} days</span>
              <span className={`font-semibold tabular-nums ${n > 0 ? 'text-amber-700' : 'text-green-700'}`}>{n} item{n !== 1 ? 's' : ''}</span>
            </div>
          );
        })}
        {aircraft?.baselineTotalTime !== undefined && (
          <div className="pt-1 border-t border-amber-200 flex items-center justify-between">
            <span>Current aircraft TT</span>
            <span className="font-semibold tabular-nums">{currentTT.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DueItemCard({ item, currentTT }: { item: DueItem; currentTT: number }) {
  const statusStyles: Record<DueStatus, string> = {
    overdue:  'border-red-400 bg-red-50',
    due_soon: 'border-amber-400 bg-amber-50',
    ok:       'border-green-300 bg-green-50/40',
    unknown:  'border-stone-300 bg-stone-50',
  };
  const statusBadge: Record<DueStatus, { label: string; cls: string }> = {
    overdue:  { label: 'OVERDUE',   cls: 'bg-red-200 text-red-900 border border-red-400' },
    due_soon: { label: 'DUE SOON',  cls: 'bg-amber-200 text-amber-900 border border-amber-400' },
    ok:       { label: 'OK',        cls: 'bg-green-200 text-green-900 border border-green-300' },
    unknown:  { label: 'CHECK',     cls: 'bg-stone-200 text-stone-700 border border-stone-300' },
  };
  const categoryColors: Record<DueCategory, string> = {
    'AD': 'bg-red-100 text-red-800 border-red-200',
    'SB': 'bg-blue-100 text-blue-800 border-blue-200',
    'Inspection': 'bg-sky-100 text-sky-800 border-sky-200',
    'Regulatory Check': 'bg-purple-100 text-purple-800 border-purple-200',
    'Component Life': 'bg-orange-100 text-orange-800 border-orange-200',
    'Other': 'bg-stone-100 text-stone-700 border-stone-200',
  };

  const badge = statusBadge[item.status];
  // currentTT intentionally unused in presentation — accepted for API consistency with future needs
  void currentTT;

  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-wrap items-start gap-3 ${statusStyles[item.status]}`}>
      {/* Left: title + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${badge.cls}`}>{badge.label}</span>
          <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${categoryColors[item.category]}`}>{item.category}</span>
          {item.referenceNumber && (
            <span className="text-[10px] font-mono text-stone-600 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">{item.referenceNumber}</span>
          )}
        </div>
        <div className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">{item.title}</div>
        {item.notes && <div className="text-xs text-stone-500 mt-0.5 italic">{item.notes}</div>}
        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-stone-500">
          {item.lastPerformedDate && (
            <span>Last: <span className="font-medium text-stone-700">{item.lastPerformedDate}</span></span>
          )}
          {item.lastPerformedTT !== undefined && (
            <span>At: <span className="font-medium text-stone-700 tabular-nums">{item.lastPerformedTT.toFixed(1)} hrs</span></span>
          )}
        </div>
      </div>

      {/* Right: due date / hours */}
      <div className="text-right flex-shrink-0 space-y-1">
        {item.dueDate && (
          <div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Due by</div>
            <div className="text-sm font-bold tabular-nums text-stone-800">{item.dueDate}</div>
            {item.daysRemaining !== undefined && (
              <div className={`text-xs font-medium tabular-nums ${item.daysRemaining < 0 ? 'text-red-700' : item.daysRemaining <= 30 ? 'text-amber-700' : 'text-green-700'}`}>
                {item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)}d overdue` : `${item.daysRemaining}d remaining`}
              </div>
            )}
          </div>
        )}
        {item.dueAtHours !== undefined && (
          <div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Due at</div>
            <div className="text-sm font-bold tabular-nums text-stone-800">{item.dueAtHours.toFixed(1)} hrs</div>
            {item.hoursRemaining !== undefined && (
              <div className={`text-xs font-medium tabular-nums ${item.hoursRemaining < 0 ? 'text-red-700' : item.hoursRemaining <= 50 ? 'text-amber-700' : 'text-green-700'}`}>
                {item.hoursRemaining < 0 ? `${Math.abs(item.hoursRemaining).toFixed(1)} hrs overdue` : `${item.hoursRemaining.toFixed(1)} hrs remaining`}
              </div>
            )}
          </div>
        )}
        {item.status === 'unknown' && (
          <div className="text-xs text-stone-400 italic">Manual check required</div>
        )}
      </div>
    </div>
  );
}
