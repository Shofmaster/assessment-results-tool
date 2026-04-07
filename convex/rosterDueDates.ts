/**
 * Pure due-date helpers for personnel roster qualifications.
 * Kept separate from Convex handlers so unit tests can import without DB.
 */

export type IntervalUnit = "days" | "months" | "years";

export type DueDateStrategy =
  | "fixed_days"
  | "fixed_interval"
  | "calendar_month_end"
  | "ia_march_odd_year";

export interface PromptFieldDef {
  id: string;
  label: string;
  fieldType: "date" | "text" | "textarea" | "number" | "select";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface RequirementRuleSlice {
  dueDateStrategy?: DueDateStrategy;
  defaultRecurrenceDays?: number;
  defaultIntervalValue?: number;
  defaultIntervalUnit?: IntervalUnit;
  /** Used with calendar_month_end when not derived from interval */
  defaultCalendarMonths?: number;
  promptSchema?: PromptFieldDef[];
}

export interface ComputeDueDateInput {
  requirement: RequirementRuleSlice;
  assignedDate?: string;
  lastCompletedDate?: string;
  evidence?: Record<string, string>;
  recurrenceDaysOverride?: number;
  recurrenceIntervalValueOverride?: number;
  recurrenceIntervalUnitOverride?: IntervalUnit;
  todayIso: string;
}

export function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(dateIso + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function endOfCalendarMonthAfterMonths(baseIso: string, monthsToAdd: number): string {
  const [yearStr, monthStr] = baseIso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd + 1, 0));
  return date.toISOString().slice(0, 10);
}

/** Next IA renewal: March 31 of the next odd year strictly after `refIso`. */
export function nextIaRenewalDueDateFromReference(refIso: string): string {
  let year = Number(refIso.slice(0, 4));
  if (year % 2 === 0) year += 1;
  let candidate = `${year}-03-31`;
  while (candidate <= refIso) {
    year += 2;
    candidate = `${year}-03-31`;
  }
  return candidate;
}

export function intervalToCalendarMonths(value: number, unit: IntervalUnit): number {
  if (unit === "days") {
    return Math.max(1, Math.round(value / 30));
  }
  if (unit === "months") {
    return Math.max(1, Math.round(value));
  }
  return Math.max(1, Math.round(value * 12));
}

export function addCalendarIntervalToDate(baseIso: string, value: number, unit: IntervalUnit): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (unit === "days") {
    date.setUTCDate(date.getUTCDate() + value);
  } else if (unit === "months") {
    date.setUTCMonth(date.getUTCMonth() + value);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + value);
  }
  return date.toISOString().slice(0, 10);
}

export function inferStrategyFromRequirement(r: RequirementRuleSlice): DueDateStrategy {
  if (r.dueDateStrategy) return r.dueDateStrategy;
  if (r.defaultCalendarMonths && r.defaultCalendarMonths > 0) return "calendar_month_end";
  if (r.defaultIntervalValue && r.defaultIntervalUnit) return "fixed_interval";
  if (r.defaultRecurrenceDays && r.defaultRecurrenceDays > 0) return "fixed_days";
  return "fixed_days";
}

export function resolveCalendarMonths(r: RequirementRuleSlice): number | undefined {
  if (r.defaultCalendarMonths && r.defaultCalendarMonths > 0) return r.defaultCalendarMonths;
  if (r.defaultIntervalUnit === "months" && r.defaultIntervalValue && r.defaultIntervalValue > 0) {
    return Math.round(r.defaultIntervalValue);
  }
  if (r.defaultIntervalUnit === "years" && r.defaultIntervalValue && r.defaultIntervalValue > 0) {
    return Math.round(r.defaultIntervalValue * 12);
  }
  if (r.defaultIntervalUnit === "days" && r.defaultIntervalValue && r.defaultIntervalValue > 0) {
    return intervalToCalendarMonths(r.defaultIntervalValue, "days");
  }
  return undefined;
}

/** Assignment-level override for calendar-month-end rules (and fallback). */
export function resolveEffectiveCalendarMonths(
  input: ComputeDueDateInput
): number | undefined {
  const o = input.recurrenceIntervalValueOverride;
  const u = input.recurrenceIntervalUnitOverride;
  if (o != null && o > 0 && u) {
    if (u === "months") return Math.round(o);
    if (u === "years") return Math.round(o * 12);
    if (u === "days") return intervalToCalendarMonths(o, "days");
  }
  return resolveCalendarMonths(input.requirement);
}

function pickBaselineDate(input: ComputeDueDateInput): string | undefined {
  const ev = input.evidence ?? {};
  return (
    input.lastCompletedDate ||
    ev.lastQualifyingActivityDate ||
    ev.lastCompletedTrainingDate ||
    ev.lastFlightReviewDate ||
    ev.lastIfExperienceDate ||
    ev.lastInstructionalActivityDate ||
    ev.lastAuthorizationReviewDate ||
    ev.lastLandingCurrencyDate ||
    ev.baselineDate ||
    ev.iaLastRenewalReferenceDate ||
    input.assignedDate
  );
}

function effectiveRecurrence(
  input: ComputeDueDateInput
): { kind: "days"; days: number } | { kind: "interval"; value: number; unit: IntervalUnit } | null {
  if (input.recurrenceDaysOverride != null && input.recurrenceDaysOverride > 0) {
    return { kind: "days", days: input.recurrenceDaysOverride };
  }
  if (
    input.recurrenceIntervalValueOverride != null &&
    input.recurrenceIntervalValueOverride > 0 &&
    input.recurrenceIntervalUnitOverride
  ) {
    return {
      kind: "interval",
      value: input.recurrenceIntervalValueOverride,
      unit: input.recurrenceIntervalUnitOverride,
    };
  }
  const r = input.requirement;
  if (r.defaultRecurrenceDays && r.defaultRecurrenceDays > 0) {
    return { kind: "days", days: r.defaultRecurrenceDays };
  }
  if (r.defaultIntervalValue && r.defaultIntervalUnit && r.defaultIntervalValue > 0) {
    return { kind: "interval", value: r.defaultIntervalValue, unit: r.defaultIntervalUnit };
  }
  return null;
}

/**
 * Computes next due date from requirement rule + assignment state.
 */
export function computeAssignmentDueDate(input: ComputeDueDateInput): {
  dueDate: string | undefined;
  warnings: string[];
} {
  const warnings: string[] = [];
  const strategy = inferStrategyFromRequirement(input.requirement);
  const base = pickBaselineDate(input) ?? input.todayIso;

  if (strategy === "ia_march_odd_year") {
    const ref = pickBaselineDate(input) ?? input.todayIso;
    return { dueDate: nextIaRenewalDueDateFromReference(ref), warnings };
  }

  if (strategy === "calendar_month_end") {
    const months = resolveEffectiveCalendarMonths(input);
    if (!months || months < 1) {
      warnings.push("Calendar-month rule is missing interval; set months on the requirement type.");
      return { dueDate: undefined, warnings };
    }
    const ref = pickBaselineDate(input);
    if (!ref) {
      warnings.push("No baseline date (last completion, evidence date, or assigned date) for calendar-based due date.");
      return { dueDate: undefined, warnings };
    }
    return { dueDate: endOfCalendarMonthAfterMonths(ref, months), warnings };
  }

  const rec = effectiveRecurrence(input);
  if (!rec) {
    warnings.push("No recurrence interval configured for this qualification.");
    return { dueDate: undefined, warnings };
  }

  const ref = pickBaselineDate(input);
  if (!ref) {
    warnings.push("No baseline date for computing the next due date.");
    return { dueDate: undefined, warnings };
  }

  if (strategy === "fixed_days" || rec.kind === "days") {
    const days = rec.kind === "days" ? rec.days : input.requirement.defaultRecurrenceDays ?? 0;
    if (!days) {
      warnings.push("Recurrence days not set.");
      return { dueDate: undefined, warnings };
    }
    return { dueDate: addDays(ref, days), warnings };
  }

  // fixed_interval / fallback
  if (rec.kind === "interval") {
    return { dueDate: addCalendarIntervalToDate(ref, rec.value, rec.unit), warnings };
  }

  return { dueDate: undefined, warnings };
}

export function listMissingPromptAnswers(
  promptSchema: PromptFieldDef[] | undefined,
  evidence: Record<string, string> | undefined
): string[] {
  if (!promptSchema?.length) return [];
  const ev = evidence ?? {};
  const missing: string[] = [];
  for (const field of promptSchema) {
    if (!field.required) continue;
    const v = ev[field.id];
    if (v == null || String(v).trim() === "") {
      missing.push(field.label || field.id);
    }
  }
  return missing;
}

/** Approximate days for legacy recurrenceDaysOverride from unitized rule. */
export function approximateRecurrenceDays(r: RequirementRuleSlice): number | undefined {
  if (r.defaultRecurrenceDays && r.defaultRecurrenceDays > 0) return r.defaultRecurrenceDays;
  if (r.defaultIntervalValue && r.defaultIntervalUnit) {
    const v = r.defaultIntervalValue;
    if (r.defaultIntervalUnit === "days") return Math.round(v);
    if (r.defaultIntervalUnit === "months") return Math.round(v * 30);
    if (r.defaultIntervalUnit === "years") return Math.round(v * 365);
  }
  const cm = resolveCalendarMonths(r);
  if (cm) return cm * 30;
  return undefined;
}
