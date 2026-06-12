/**
 * Due-list forecasting engine — pure functions, no Convex imports.
 *
 * Computes "what's coming due" across three native sources (recurring
 * inspection schedule items, recurring logbook entries, life-limited
 * components) against per-aircraft daily utilization rates. Items that cannot
 * be forecast are NEVER dropped — they land in the `unforecastable` bucket
 * with a human-readable reason, because a silently missing due item is worse
 * than a visibly incomplete one.
 *
 * Consumed by the ComingDueCard (client) and, later, the iCal feed endpoint
 * and the Ask an Expert `list_upcoming_due` tool.
 */

export type DueUnit = 'hours' | 'cycles' | 'landings';
export type DueBucket = 'overdue' | 'due30' | 'due60' | 'due90' | 'later' | 'unforecastable';
export type DueSourceKind = 'schedule' | 'logbook' | 'component';

/** currentAsOfDate older than this → forecasts for the aircraft flagged stale. */
export const UTILIZATION_STALE_DAYS = 30;
/** Derived-rate windows shorter than this can't produce a trustworthy rate. */
export const MIN_DERIVED_WINDOW_DAYS = 7;
/** Derived beats manual when its observation window is at least this long. */
export const DERIVED_OVER_MANUAL_WINDOW_DAYS = 30;

// ── Inputs (slim shapes mapped from Convex rows) ────────────────────────────

export interface AircraftUtilizationInput {
  aircraftId: string;
  tailNumber: string;
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
}

export interface ScheduleItemInput {
  kind: 'schedule';
  sourceId: string;
  title: string;
  intervalType: string; // 'calendar' | 'hours' | 'cycles'
  intervalMonths?: number;
  intervalDays?: number;
  intervalValue?: number;
  lastPerformedAt?: string;
  regulationRef?: string;
}

export interface LogbookRecurrenceInput {
  kind: 'logbook';
  sourceId: string;
  aircraftId: string;
  title: string;
  ataChapter?: string;
  entryDate?: string;
  nextDueDate?: string;
  recurrenceInterval?: number;
  recurrenceUnit?: string; // 'hours' | 'cycles' | 'landings' | 'calendar_months' | 'calendar_days'
  totalTimeAtEntry?: number;
  totalCyclesAtEntry?: number;
  totalLandingsAtEntry?: number;
}

export interface ComponentInput {
  kind: 'component';
  sourceId: string;
  aircraftId: string;
  title: string;
  ataChapter?: string;
  lifeLimit?: number;
  lifeLimitUnit?: string; // 'hours' | 'cycles' | 'landings' | 'calendar_months'
  tsnAtInstall?: number;
  tsoAtInstall?: number;
  cyclesAtInstall?: number;
  aircraftTimeAtInstall?: number;
  aircraftCyclesAtInstall?: number;
  installDate?: string;
}

export type DueForecastInput = ScheduleItemInput | LogbookRecurrenceInput | ComponentInput;

// ── Outputs ─────────────────────────────────────────────────────────────────

export interface RateInfo {
  perDay: number;
  source: 'derived' | 'manual';
  windowDays?: number;
}

export interface AircraftRates {
  aircraftId: string;
  tailNumber: string;
  hours?: RateInfo;
  cycles?: RateInfo;
  landings?: RateInfo;
  currentTotals: { hours?: number; cycles?: number; landings?: number; asOfDate?: string };
  /** True when currentAsOfDate is missing or older than UTILIZATION_STALE_DAYS. */
  stale: boolean;
}

export interface DueForecastItem {
  source: DueSourceKind;
  sourceId: string;
  aircraftId?: string;
  tailNumber?: string;
  title: string;
  ataChapter?: string;
  /** ISO date (YYYY-MM-DD) when a calendar due date is known or projected. */
  dueDate?: string;
  /** Days until due; negative = overdue by that many days. */
  days?: number;
  /** For hours/cycles items: value remaining until due (negative = overdue). */
  remainingValue?: number;
  remainingUnit?: DueUnit;
  bucket: DueBucket;
  /** Why the item is unforecastable / which rate was used — shown in UI. */
  reasons: string[];
  /** Aircraft utilization data is stale; forecast shown with an as-of note. */
  stale: boolean;
  rateSource?: 'derived' | 'manual';
}

export interface DueForecastSummary {
  items: DueForecastItem[];
  counts: Record<DueBucket, number>;
  rates: AircraftRates[];
}

// ── Date helpers (date-only arithmetic, consistent with inspectionSchedule.ts) ──

export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addMonthsClamped(date: Date, months: number): Date {
  // Jan 31 + 1 month must not roll into March: clamp to the target month's last day.
  const targetMonthFirst = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth() + 1, 0).getDate();
  return new Date(
    targetMonthFirst.getFullYear(),
    targetMonthFirst.getMonth(),
    Math.min(date.getDate(), lastDay),
  );
}

// ── Rates ───────────────────────────────────────────────────────────────────

function deriveRateForUnit(
  baseline: number | undefined,
  baselineAsOf: string | undefined,
  current: number | undefined,
  currentAsOf: string | undefined,
  manual: number | undefined,
): RateInfo | undefined {
  let derived: RateInfo | undefined;
  if (
    typeof baseline === 'number' &&
    typeof current === 'number' &&
    baselineAsOf &&
    currentAsOf
  ) {
    const from = parseDateOnly(baselineAsOf);
    const to = parseDateOnly(currentAsOf);
    if (from && to) {
      const windowDays = daysBetween(from, to);
      const delta = current - baseline;
      if (windowDays >= MIN_DERIVED_WINDOW_DAYS && delta > 0) {
        derived = { perDay: delta / windowDays, source: 'derived', windowDays };
      }
    }
  }
  const manualRate: RateInfo | undefined =
    typeof manual === 'number' && manual > 0 ? { perDay: manual, source: 'manual' } : undefined;

  // Derived wins when its window is long enough to trust; manual fills gaps.
  if (derived && (derived.windowDays ?? 0) >= DERIVED_OVER_MANUAL_WINDOW_DAYS) return derived;
  if (manualRate) return manualRate;
  return derived;
}

export function deriveDailyRates(aircraft: AircraftUtilizationInput, today: Date): AircraftRates {
  const asOf = aircraft.currentAsOfDate ? parseDateOnly(aircraft.currentAsOfDate) : null;
  const stale = !asOf || daysBetween(asOf, today) > UTILIZATION_STALE_DAYS;
  return {
    aircraftId: aircraft.aircraftId,
    tailNumber: aircraft.tailNumber,
    hours: deriveRateForUnit(
      aircraft.baselineTotalTime,
      aircraft.baselineAsOfDate,
      aircraft.currentTotalTime,
      aircraft.currentAsOfDate,
      aircraft.estDailyHours,
    ),
    cycles: deriveRateForUnit(
      aircraft.baselineTotalCycles,
      aircraft.baselineAsOfDate,
      aircraft.currentTotalCycles,
      aircraft.currentAsOfDate,
      aircraft.estDailyCycles,
    ),
    landings: deriveRateForUnit(
      aircraft.baselineTotalLandings,
      aircraft.baselineAsOfDate,
      aircraft.currentTotalLandings,
      aircraft.currentAsOfDate,
      aircraft.estDailyLandings,
    ),
    currentTotals: {
      hours: aircraft.currentTotalTime,
      cycles: aircraft.currentTotalCycles,
      landings: aircraft.currentTotalLandings,
      asOfDate: aircraft.currentAsOfDate,
    },
    stale,
  };
}

// ── Buckets ─────────────────────────────────────────────────────────────────

export function bucketize(days: number): Exclude<DueBucket, 'unforecastable'> {
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due30';
  if (days <= 60) return 'due60';
  if (days <= 90) return 'due90';
  return 'later';
}

// ── Per-item forecast ───────────────────────────────────────────────────────

const UNIT_LABEL: Record<DueUnit, string> = { hours: 'hr', cycles: 'cyc', landings: 'ldg' };

function unforecastable(
  input: DueForecastInput,
  reasons: string[],
  rates?: AircraftRates,
): DueForecastItem {
  return {
    source: input.kind,
    sourceId: input.sourceId,
    aircraftId: 'aircraftId' in input ? input.aircraftId : undefined,
    tailNumber: rates?.tailNumber,
    title: input.title,
    ataChapter: 'ataChapter' in input ? input.ataChapter : undefined,
    bucket: 'unforecastable',
    reasons,
    stale: rates?.stale ?? false,
  };
}

function forecastFromDate(
  input: DueForecastInput,
  dueDate: Date,
  today: Date,
  rates?: AircraftRates,
  extraReasons: string[] = [],
): DueForecastItem {
  const days = daysBetween(today, dueDate);
  return {
    source: input.kind,
    sourceId: input.sourceId,
    aircraftId: 'aircraftId' in input ? input.aircraftId : undefined,
    tailNumber: rates?.tailNumber,
    title: input.title,
    ataChapter: 'ataChapter' in input ? input.ataChapter : undefined,
    dueDate: formatDateOnly(dueDate),
    days,
    bucket: bucketize(days),
    reasons: extraReasons,
    stale: rates?.stale ?? false,
  };
}

function forecastFromRemaining(
  input: DueForecastInput,
  remaining: number,
  unit: DueUnit,
  rates: AircraftRates,
  today: Date,
): DueForecastItem {
  const rate = rates[unit];
  if (!rate) {
    return {
      ...unforecastable(input, [`needs utilization data (${UNIT_LABEL[unit]}/day rate)`], rates),
      remainingValue: remaining,
      remainingUnit: unit,
    };
  }
  const days = remaining <= 0 ? Math.ceil(remaining / rate.perDay) : Math.floor(remaining / rate.perDay);
  const dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return {
    source: input.kind,
    sourceId: input.sourceId,
    aircraftId: 'aircraftId' in input ? input.aircraftId : undefined,
    tailNumber: rates.tailNumber,
    title: input.title,
    ataChapter: 'ataChapter' in input ? input.ataChapter : undefined,
    dueDate: formatDateOnly(dueDate),
    days,
    remainingValue: remaining,
    remainingUnit: unit,
    bucket: bucketize(days),
    reasons: [],
    stale: rates.stale,
    rateSource: rate.source,
  };
}

function forecastScheduleItem(input: ScheduleItemInput, today: Date): DueForecastItem {
  if (input.intervalType !== 'calendar') {
    // Hours/cycles schedule items have no aircraft tie or value anchor.
    return unforecastable(input, ['hours/cycles interval has no aircraft utilization anchor']);
  }
  if (!input.lastPerformedAt) {
    return unforecastable(input, ['no last-performed date']);
  }
  const last = parseDateOnly(input.lastPerformedAt);
  if (!last) return unforecastable(input, ['invalid last-performed date']);
  const months = input.intervalMonths ?? 0;
  const days = input.intervalDays ?? 0;
  if (months > 0) return forecastFromDate(input, addMonthsClamped(last, months), today);
  if (days > 0) {
    return forecastFromDate(input, new Date(last.getFullYear(), last.getMonth(), last.getDate() + days), today);
  }
  return unforecastable(input, ['no calendar interval configured']);
}

function forecastLogbookRecurrence(
  input: LogbookRecurrenceInput,
  rates: AircraftRates | undefined,
  today: Date,
): DueForecastItem {
  const unit = String(input.recurrenceUnit || '');

  // Explicit next-due date always wins (it is what the entry asserts).
  if (input.nextDueDate) {
    const due = parseDateOnly(input.nextDueDate);
    if (due) return forecastFromDate(input, due, today, rates);
  }

  if (unit === 'calendar_months' || unit === 'calendar_days') {
    if (!input.entryDate) return unforecastable(input, ['no entry date to anchor the recurrence'], rates);
    const anchor = parseDateOnly(input.entryDate);
    if (!anchor) return unforecastable(input, ['invalid entry date'], rates);
    const interval = input.recurrenceInterval ?? 0;
    if (interval <= 0) return unforecastable(input, ['no recurrence interval'], rates);
    const due =
      unit === 'calendar_months'
        ? addMonthsClamped(anchor, interval)
        : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + interval);
    return forecastFromDate(input, due, today, rates);
  }

  if (unit === 'hours' || unit === 'cycles' || unit === 'landings') {
    if (!rates) return unforecastable(input, ['aircraft not found for this entry']);
    const interval = input.recurrenceInterval ?? 0;
    if (interval <= 0) return unforecastable(input, ['no recurrence interval'], rates);
    const atEntry =
      unit === 'hours'
        ? input.totalTimeAtEntry
        : unit === 'cycles'
          ? input.totalCyclesAtEntry
          : input.totalLandingsAtEntry;
    if (typeof atEntry !== 'number') {
      return unforecastable(input, [`entry is missing aircraft ${unit} at compliance`], rates);
    }
    const current = rates.currentTotals[unit];
    if (typeof current !== 'number') {
      return unforecastable(input, [`needs utilization data (current ${unit})`], rates);
    }
    const remaining = atEntry + interval - current;
    return forecastFromRemaining(input, remaining, unit, rates, today);
  }

  return unforecastable(input, ['no recurrence configured'], rates);
}

function forecastComponent(
  input: ComponentInput,
  rates: AircraftRates | undefined,
  today: Date,
): DueForecastItem {
  const limit = input.lifeLimit ?? 0;
  const unit = String(input.lifeLimitUnit || '');
  if (limit <= 0) return unforecastable(input, ['no life limit configured'], rates);

  if (unit === 'calendar_months') {
    if (!input.installDate) return unforecastable(input, ['no install date'], rates);
    const installed = parseDateOnly(input.installDate);
    if (!installed) return unforecastable(input, ['invalid install date'], rates);
    return forecastFromDate(input, addMonthsClamped(installed, limit), today, rates);
  }

  if (unit === 'hours' || unit === 'cycles') {
    if (!rates) return unforecastable(input, ['aircraft not found for this component']);
    const current = rates.currentTotals[unit];
    const atInstall = unit === 'hours' ? input.aircraftTimeAtInstall : input.aircraftCyclesAtInstall;
    const componentAtInstall =
      unit === 'hours' ? (input.tsnAtInstall ?? input.tsoAtInstall ?? 0) : (input.cyclesAtInstall ?? 0);
    if (typeof current !== 'number') {
      return unforecastable(input, [`needs utilization data (current ${unit})`], rates);
    }
    if (typeof atInstall !== 'number') {
      return unforecastable(input, [`no aircraft ${unit} recorded at install`], rates);
    }
    const consumedSinceInstall = current - atInstall;
    const remaining = limit - (componentAtInstall + consumedSinceInstall);
    return forecastFromRemaining(input, remaining, unit, rates, today);
  }

  if (unit === 'landings') {
    // aircraftComponents has no landings-at-install anchor.
    return unforecastable(input, ['landings life limits have no install anchor recorded'], rates);
  }

  return unforecastable(input, ['unknown life-limit unit'], rates);
}

export function forecastItem(
  input: DueForecastInput,
  rates: AircraftRates | undefined,
  today: Date,
): DueForecastItem {
  switch (input.kind) {
    case 'schedule':
      return forecastScheduleItem(input, today);
    case 'logbook':
      return forecastLogbookRecurrence(input, rates, today);
    case 'component':
      return forecastComponent(input, rates, today);
  }
}

// ── Project-level rollup ────────────────────────────────────────────────────

export function forecastProject(
  aircraft: AircraftUtilizationInput[],
  inputs: DueForecastInput[],
  today: Date,
): DueForecastSummary {
  const rates = aircraft.map((a) => deriveDailyRates(a, today));
  const ratesById = new Map(rates.map((r) => [r.aircraftId, r]));
  const items = inputs
    .map((input) =>
      forecastItem(input, 'aircraftId' in input ? ratesById.get(input.aircraftId) : undefined, today),
    )
    .sort((a, b) => {
      // Soonest first; unforecastable last.
      if (a.bucket === 'unforecastable' && b.bucket !== 'unforecastable') return 1;
      if (b.bucket === 'unforecastable' && a.bucket !== 'unforecastable') return -1;
      return (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER);
    });
  const counts: Record<DueBucket, number> = {
    overdue: 0,
    due30: 0,
    due60: 0,
    due90: 0,
    later: 0,
    unforecastable: 0,
  };
  for (const item of items) counts[item.bucket] += 1;
  return { items, counts, rates };
}

/** Display text: "overdue by 12 hr", "due in 23 days", "due 2026-07-01". */
export function dueInText(item: DueForecastItem): string {
  if (item.bucket === 'unforecastable') return item.reasons[0] || 'cannot forecast';
  if (typeof item.remainingValue === 'number' && item.remainingUnit && item.remainingValue < 0) {
    return `overdue by ${Math.abs(Math.round(item.remainingValue))} ${UNIT_LABEL[item.remainingUnit]}`;
  }
  if (typeof item.days === 'number') {
    if (item.days < 0) return `overdue by ${Math.abs(item.days)} day${Math.abs(item.days) === 1 ? '' : 's'}`;
    if (item.days === 0) return 'due today';
    return `due in ${item.days} day${item.days === 1 ? '' : 's'}`;
  }
  return item.dueDate ? `due ${item.dueDate}` : 'due date unknown';
}
