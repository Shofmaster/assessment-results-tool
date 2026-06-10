/**
 * Due-list reconciliation: pairs imported tracker rows (CAMP/Veryon) with
 * AeroGap's own forecast items and flags disagreement.
 *
 * Design principle: unmatched beats wrongly matched. The matcher is
 * conservative (ATA + title-token overlap), tolerances absorb rounding, and a
 * matched pair with no comparable axis counts as agreement — reconciliation
 * should surface real gaps, not manufacture alarms.
 */

import type { AircraftRates, DueForecastItem } from './dueForecast';
import { parseDateOnly, daysBetween } from './dueForecast';

export const RECONCILE_TOLERANCE_DAYS = 3;
export const RECONCILE_TOLERANCE_HOURS = 5;
/** Minimum title-token Jaccard overlap to accept a title-only match. */
export const TITLE_MATCH_THRESHOLD = 0.6;

export interface ExternalDueRow {
  sourceId: string;
  aircraftId: string;
  provider: string;
  title: string;
  ataChapter?: string;
  intervalText?: string;
  nextDueDate?: string;
  nextDueHours?: number;
  nextDueCycles?: number;
  remainingText?: string;
  reportAsOfDate?: string;
}

export type ReconcileStatus = 'agrees' | 'mismatch' | 'only_external' | 'only_aerogap';

export interface ReconcilePair {
  status: ReconcileStatus;
  external?: ExternalDueRow;
  native?: DueForecastItem;
  /** Signed difference when dates were compared: external − native, in days. */
  deltaDays?: number;
  /** Signed difference when hours were compared: external − native, in hours. */
  deltaHours?: number;
  /** Human-readable comparison, e.g. "CAMP: due 4,250.0 hr · AeroGap logbooks: 4,210.0 hr". */
  note?: string;
}

export interface ReconcileSummary {
  pairs: ReconcilePair[];
  counts: Record<ReconcileStatus, number>;
}

// ── Title matching ──────────────────────────────────────────────────────────

const TITLE_SYNONYMS: Record<string, string> = {
  hr: 'hour',
  hrs: 'hour',
  hours: 'hour',
  insp: 'inspection',
  inspect: 'inspection',
  mo: 'month',
  mos: 'month',
  months: 'month',
  yr: 'year',
  yrs: 'year',
  annual: 'year',
  repl: 'replace',
  replacement: 'replace',
  o_h: 'overhaul',
  oh: 'overhaul',
};

export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 || /^\d$/.test(t))
    .map((t) => TITLE_SYNONYMS[t] ?? t);
  return new Set(tokens);
}

export function titleOverlap(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  return intersection / (ta.size + tb.size - intersection);
}

function normalizedAta(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /(\d{1,2})/.exec(value);
  return m ? m[1].padStart(2, '0') : undefined;
}

// ── Comparison ──────────────────────────────────────────────────────────────

function compareMatched(
  external: ExternalDueRow,
  native: DueForecastItem,
  rates: AircraftRates | undefined,
): ReconcilePair {
  const providerLabel = external.provider === 'camp' ? 'CAMP' : external.provider === 'veryon' ? 'Veryon' : 'Tracker';

  // Hours axis: external due-at hours vs native current + remaining.
  const currentHours = rates?.currentTotals.hours;
  if (
    typeof external.nextDueHours === 'number' &&
    native.remainingUnit === 'hours' &&
    typeof native.remainingValue === 'number' &&
    typeof currentHours === 'number'
  ) {
    const nativeDueAtHours = currentHours + native.remainingValue;
    const deltaHours = external.nextDueHours - nativeDueAtHours;
    const agrees = Math.abs(deltaHours) <= RECONCILE_TOLERANCE_HOURS;
    return {
      status: agrees ? 'agrees' : 'mismatch',
      external,
      native,
      deltaHours,
      note: agrees
        ? undefined
        : `${providerLabel}: due at ${external.nextDueHours.toFixed(1)} hr · AeroGap logbooks: ${nativeDueAtHours.toFixed(1)} hr`,
    };
  }

  // Date axis.
  if (external.nextDueDate && native.dueDate) {
    const ext = parseDateOnly(external.nextDueDate);
    const nat = parseDateOnly(native.dueDate);
    if (ext && nat) {
      const deltaDays = daysBetween(nat, ext);
      const agrees = Math.abs(deltaDays) <= RECONCILE_TOLERANCE_DAYS;
      return {
        status: agrees ? 'agrees' : 'mismatch',
        external,
        native,
        deltaDays,
        note: agrees
          ? undefined
          : `${providerLabel}: due ${external.nextDueDate} · AeroGap: due ${native.dueDate}`,
      };
    }
  }

  // Matched but nothing comparable — nothing contradicts, count as agreement.
  return { status: 'agrees', external, native };
}

// ── Matcher ─────────────────────────────────────────────────────────────────

/**
 * Reconcile imported tracker rows against native aircraft-tied forecast items.
 * Tiers per aircraft: (a) ATA match + best title overlap, (b) title overlap
 * >= threshold. One-to-one: each native item matches at most one external row.
 */
export function reconcileDueLists(
  nativeItems: DueForecastItem[],
  externalRows: ExternalDueRow[],
  rates: AircraftRates[],
): ReconcileSummary {
  const ratesById = new Map(rates.map((r) => [r.aircraftId, r]));
  const nativeByAircraft = new Map<string, DueForecastItem[]>();
  for (const item of nativeItems) {
    if (!item.aircraftId) continue;
    if (!nativeByAircraft.has(item.aircraftId)) nativeByAircraft.set(item.aircraftId, []);
    nativeByAircraft.get(item.aircraftId)!.push(item);
  }

  const pairs: ReconcilePair[] = [];
  const matchedNative = new Set<DueForecastItem>();

  for (const external of externalRows) {
    const candidates = (nativeByAircraft.get(external.aircraftId) ?? []).filter(
      (n) => !matchedNative.has(n),
    );
    let best: { item: DueForecastItem; score: number; ataMatched: boolean } | null = null;
    const extAta = normalizedAta(external.ataChapter);
    for (const candidate of candidates) {
      const overlap = titleOverlap(external.title, candidate.title);
      const ataMatched = Boolean(extAta && normalizedAta(candidate.ataChapter) === extAta);
      // ATA agreement lowers the title bar; ATA disagreement (both present) disqualifies.
      const candAta = normalizedAta(candidate.ataChapter);
      if (extAta && candAta && candAta !== extAta) continue;
      const accepted = ataMatched ? overlap >= 0.25 : overlap >= TITLE_MATCH_THRESHOLD;
      if (!accepted) continue;
      const score = overlap + (ataMatched ? 0.5 : 0);
      if (!best || score > best.score) best = { item: candidate, score, ataMatched };
    }
    if (best) {
      matchedNative.add(best.item);
      pairs.push(compareMatched(external, best.item, ratesById.get(external.aircraftId)));
    } else {
      pairs.push({ status: 'only_external', external });
    }
  }

  for (const items of nativeByAircraft.values()) {
    for (const item of items) {
      if (!matchedNative.has(item)) pairs.push({ status: 'only_aerogap', native: item });
    }
  }

  const counts: Record<ReconcileStatus, number> = {
    agrees: 0,
    mismatch: 0,
    only_external: 0,
    only_aerogap: 0,
  };
  for (const pair of pairs) counts[pair.status] += 1;
  return { pairs, counts };
}
