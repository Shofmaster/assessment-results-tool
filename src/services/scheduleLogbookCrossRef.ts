import type { InspectionScheduleItem } from '../types/inspectionSchedule';
import { computeNextDue, getDueStatus, type DueStatus } from '../types/inspectionSchedule';
import type { LogbookEntry } from '../types/logbook';

export type CrossRefStatus = 'overdue' | 'due_soon' | 'current' | 'never';

export interface ScheduleLogbookCrossRefRow {
  item: InspectionScheduleItem;
  /** Best-matching logbook entry (inspection / work), if any. */
  matchedEntry: LogbookEntry | null;
  /** ISO date from logbook entry or item.lastPerformedAt — whichever is more recent when both exist. */
  lastEvidenceDate: string | null;
  status: CrossRefStatus;
  /** From schedule math when calendar-based. */
  scheduleDueStatus: DueStatus;
  nextDue: string | null;
}

function normalizeAta(ch?: string | null): string | null {
  if (!ch || !ch.trim()) return null;
  const t = ch.trim().replace(/^chapter\s+/i, '');
  const n = t.replace(/^0+/, '') || '0';
  return n;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Score how well a logbook entry matches a schedule item (higher = better). */
export function scoreEntryForScheduleItem(
  item: Pick<InspectionScheduleItem, 'title' | 'description' | 'category' | 'ataChapter'>,
  entry: Pick<LogbookEntry, 'entryType' | 'ataChapter' | 'workPerformed' | 'rawText' | 'inspectionType' | 'entryDate'>
): number {
  let score = 0;
  const itemAta = normalizeAta(item.ataChapter ?? undefined);
  const entryAta = normalizeAta(entry.ataChapter);
  if (itemAta && entryAta && itemAta === entryAta) score += 40;

  const hay = `${entry.workPerformed || ''} ${entry.rawText || ''}`.toLowerCase();
  const itemTokens = tokenize(`${item.title} ${item.description || ''} ${item.category || ''}`);
  for (const tok of itemTokens) {
    if (tok.length > 3 && hay.includes(tok)) score += 2;
  }

  if (entry.entryType === 'inspection') score += 15;
  if (entry.entryType === 'regulatory_check') score += 8;

  const titleLower = item.title.toLowerCase();
  if (titleLower.includes('100') && entry.inspectionType === '100_hour') score += 25;
  if (titleLower.includes('annual') && entry.inspectionType === 'annual') score += 25;
  if (titleLower.includes('progressive') && entry.inspectionType === 'progressive') score += 20;

  return score;
}

function compareIsoDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function mapDueToCrossRef(d: DueStatus): CrossRefStatus {
  if (d === 'overdue') return 'overdue';
  if (d === 'due_soon') return 'due_soon';
  if (d === 'on_track') return 'current';
  return 'never';
}

/**
 * Join inspection schedule items to the most relevant logbook evidence per item.
 */
export function buildScheduleLogbookCrossRef(
  items: InspectionScheduleItem[],
  entries: LogbookEntry[]
): ScheduleLogbookCrossRefRow[] {
  const datedEntries = [...entries].filter((e) => e.entryDate).sort((a, b) => compareIsoDate(b.entryDate!, a.entryDate!));

  return items.map((item) => {
    let best: LogbookEntry | null = null;
    let bestScore = 0;
    for (const e of datedEntries) {
      const s = scoreEntryForScheduleItem(item, e);
      if (s > bestScore) {
        bestScore = s;
        best = e;
      } else if (s === bestScore && s > 0 && best && e.entryDate && best.entryDate) {
        if (compareIsoDate(e.entryDate, best.entryDate) > 0) best = e;
      }
    }

    const lastSchedule = item.lastPerformedAt?.slice(0, 10) ?? null;
    const lastLog = best?.entryDate?.slice(0, 10) ?? null;
    let lastEvidenceDate: string | null = null;
    if (lastSchedule && lastLog) {
      lastEvidenceDate = compareIsoDate(lastLog, lastSchedule) >= 0 ? lastLog : lastSchedule;
    } else {
      lastEvidenceDate = lastLog || lastSchedule;
    }

    const nextDue = computeNextDue(item);
    const scheduleDueStatus = getDueStatus(nextDue);
    let status = mapDueToCrossRef(scheduleDueStatus);

    if (best && best.entryType === 'inspection' && lastLog && (!lastSchedule || compareIsoDate(lastLog, lastSchedule) >= 0)) {
      if (status === 'never' && lastLog) status = 'current';
    }

    if (!item.lastPerformedAt && !best) status = 'never';

    return {
      item,
      matchedEntry: bestScore >= 6 ? best : null,
      lastEvidenceDate,
      status,
      scheduleDueStatus,
      nextDue,
    };
  });
}
