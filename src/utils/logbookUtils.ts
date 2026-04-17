import {
  LOGBOOK_ENTRY_TYPE_ORDER,
  getLogbookEntryTypeLabel,
  hasAdReference,
  hasSbReference,
  type LogbookEntry,
  type AircraftComponent,
} from '../types/logbook';

export type Tab = 'library' | 'search' | 'configuration' | 'findings' | 'timeline' | 'due_list' | 'schedule';
export type ArrangeBy = 'date_desc' | 'date_asc' | 'type_sections';
export type EntryLocation = 'full' | 'ad' | 'sb';

export type EntrySection = {
  key: string;
  label: string;
  entries: LogbookEntry[];
};

export function compareEntryDate(a: LogbookEntry, b: LogbookEntry, order: 'asc' | 'desc') {
  const aDate = a.entryDate ?? '';
  const bDate = b.entryDate ?? '';
  if (!aDate && bDate) return 1;
  if (aDate && !bDate) return -1;
  const dateSort = order === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  if (dateSort !== 0) return dateSort;
  return a._id.localeCompare(b._id);
}

export function groupEntriesByType(entries: LogbookEntry[], order: 'asc' | 'desc'): EntrySection[] {
  const buckets = new Map<string, LogbookEntry[]>();
  for (const entry of entries) {
    const key = entry.entryType ?? 'other';
    const list = buckets.get(key) ?? [];
    list.push(entry);
    buckets.set(key, list);
  }

  const sections: EntrySection[] = [];
  for (const typeKey of LOGBOOK_ENTRY_TYPE_ORDER) {
    const list = buckets.get(typeKey);
    if (!list || list.length === 0) continue;
    sections.push({
      key: typeKey,
      label: getLogbookEntryTypeLabel(typeKey),
      entries: [...list].sort((a, b) => compareEntryDate(a, b, order)),
    });
    buckets.delete(typeKey);
  }

  for (const [key, list] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sections.push({
      key,
      label: getLogbookEntryTypeLabel(key),
      entries: [...list].sort((a, b) => compareEntryDate(a, b, order)),
    });
  }

  return sections;
}

export function filterEntriesByLocation(entries: LogbookEntry[], location: EntryLocation): LogbookEntry[] {
  if (location === 'ad') return entries.filter((entry) => hasAdReference(entry));
  if (location === 'sb') return entries.filter((entry) => hasSbReference(entry));
  return entries;
}

export type TTLUnit = 'hours' | 'cycles' | 'landings' | 'calendar_months';

export type TTLResult =
  | { manualCheck: true; unit: string; lifeLimit: number }
  | { manualCheck: false; unit: TTLUnit; currentUsed: number; remaining: number; remainingPct: number; lifeLimit: number };

export function calcTTL(component: AircraftComponent, currentAircraftTime: number | undefined): TTLResult | null {
  if (!component.isLifeLimited || !component.lifeLimit) return null;
  const unit = (component.lifeLimitUnit ?? 'hours') as TTLUnit;

  if (unit === 'hours') {
    const timeAtInstall = component.aircraftTimeAtInstall ?? 0;
    const tsnAtInstall = component.tsnAtInstall ?? 0;
    const usedSinceInstall = Math.max(0, (currentAircraftTime ?? 0) - timeAtInstall);
    const currentUsed = tsnAtInstall + usedSinceInstall;
    const remaining = component.lifeLimit - currentUsed;
    return { manualCheck: false, unit, currentUsed, remaining, remainingPct: remaining / component.lifeLimit, lifeLimit: component.lifeLimit };
  }

  if (unit === 'calendar_months') {
    if (!component.installDate) return { manualCheck: true, unit, lifeLimit: component.lifeLimit };
    const monthsInstalled = (Date.now() - new Date(component.installDate).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    const remaining = component.lifeLimit - monthsInstalled;
    return { manualCheck: false, unit, currentUsed: monthsInstalled, remaining, remainingPct: remaining / component.lifeLimit, lifeLimit: component.lifeLimit };
  }

  // cycles / landings — require schema data not yet stored; flag for manual check
  return { manualCheck: true, unit, lifeLimit: component.lifeLimit };
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** Average aircraft hours per month, computed over the last `windowDays` of logbook entries. */
export function calcUtilizationRate(entries: LogbookEntry[], windowDays = 180): number | null {
  const cutoff = nDaysAgo(windowDays);
  const relevant = entries
    .filter((e) => e.entryDate && e.entryDate >= cutoff && e.totalTimeAtEntry !== undefined)
    .sort((a, b) => a.entryDate!.localeCompare(b.entryDate!));
  if (relevant.length < 2) return null;
  const first = relevant[0];
  const last = relevant[relevant.length - 1];
  const ttDelta = last.totalTimeAtEntry! - first.totalTimeAtEntry!;
  const d = daysBetween(first.entryDate!, last.entryDate!);
  if (d <= 0 || ttDelta <= 0) return null;
  return ttDelta / (d / 30.4375);
}

/** Format months as "Xmo" or "Xyr Ymo". */
export function fmtMonths(m: number): string {
  if (m < 0) return 'overdue';
  const mo = Math.round(m);
  if (mo < 12) return `${mo} mo`;
  const yr = Math.floor(mo / 12);
  const rem = mo % 12;
  return rem > 0 ? `${yr}yr ${rem}mo` : `${yr}yr`;
}

export function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
