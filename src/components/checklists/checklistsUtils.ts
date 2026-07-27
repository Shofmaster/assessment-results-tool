import { computeNextDue, getDueStatus } from "../../types/inspectionSchedule";

export type ChecklistItemStatus = "not_started" | "in_progress" | "complete" | "blocked";
export type DueFilter = "all" | "incomplete" | "overdue" | "due_soon" | "due_week" | "no_due";
export type ExecutionSort = "due_asc" | "section" | "severity";

export function getChecklistItemDisplayDue(
  item: {
    dueDate?: string;
    intervalMonths?: number;
    intervalDays?: number;
    lastPerformedAt?: string;
  },
  runNextCycleDue?: string | null,
): string | null {
  const months = item.intervalMonths ?? 0;
  const days = item.intervalDays ?? 0;
  if (months > 0 || days > 0) {
    const next = computeNextDue({
      lastPerformedAt: item.lastPerformedAt ?? undefined,
      intervalType: "calendar",
      intervalMonths: months,
      intervalDays: days,
      intervalValue: undefined,
    });
    if (next) return next;
  }
  if (item.dueDate?.slice(0, 10)) return item.dueDate.slice(0, 10);
  return runNextCycleDue?.slice(0, 10) ?? null;
}

export function dueBadgeClass(status: ReturnType<typeof getDueStatus>, isDark = true): string {
  if (status === "overdue") return isDark ? "text-red-300 bg-red-500/15 border-red-500/30" : "text-red-700 bg-red-50 border-red-200";
  if (status === "due_soon") return isDark ? "text-amber-200 bg-amber-500/15 border-amber-500/25" : "text-amber-800 bg-amber-50 border-amber-200";
  if (status === "on_track") return isDark ? "text-emerald-200/90 bg-emerald-500/10 border-emerald-500/25" : "text-emerald-800 bg-emerald-50 border-emerald-200";
  return isDark ? "text-white/50 bg-white/5 border-white/10" : "text-slate-500 bg-slate-100 border-slate-200";
}

export function diffDaysFromToday(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function computeComplianceScore(items: any[]): {
  score: number;
  earned: number;
  max: number;
  hasScoring: boolean;
} {
  let earned = 0;
  let max = 0;
  let hasScoring = false;
  for (const item of items) {
    const pv = item.pointValue ?? 1;
    if (item.responseType === "pass_fail_na") {
      hasScoring = true;
      if (item.passFail === "na") continue;
      max += pv;
      if (item.passFail === "pass") earned += pv;
    } else if (item.pointValue != null) {
      hasScoring = true;
      max += pv;
      if (item.status === "complete") earned += pv;
    }
  }
  const score = max > 0 ? Math.round((earned / max) * 100) : 0;
  return { score, earned, max, hasScoring };
}

export function itemMatchesDueFilter(
  item: { status: string },
  filter: DueFilter,
  displayDue: string | null,
): boolean {
  if (filter === "all") return true;
  const incomplete = item.status !== "complete";
  if (filter === "incomplete") return incomplete;
  if (!incomplete) return false;
  if (filter === "no_due") return !displayDue;
  if (!displayDue) return false;
  const diff = diffDaysFromToday(displayDue);
  if (filter === "overdue") return diff < 0;
  if (filter === "due_soon") return diff < 0 || (diff >= 0 && diff <= 30);
  if (filter === "due_week") return diff >= 0 && diff <= 7;
  return true;
}

export function sortExecutionItems(
  items: any[],
  sort: ExecutionSort,
  runNextCycleDue?: string | null,
  sectionOrder?: string[],
): any[] {
  const copy = [...items];
  if (sort === "section") {
    const orderMap = new Map((sectionOrder ?? []).map((s, i) => [s, i]));
    copy.sort((a, b) => {
      const ai = orderMap.has(a.section) ? orderMap.get(a.section)! : 9999;
      const bi = orderMap.has(b.section) ? orderMap.get(b.section)! : 9999;
      if (ai !== bi) return ai - bi;
      return (a.section || "").localeCompare(b.section || "") || a.title.localeCompare(b.title);
    });
  } else if (sort === "severity") {
    const rank: Record<string, number> = { critical: 0, major: 1, minor: 2, observation: 3 };
    copy.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  } else {
    copy.sort((a, b) => {
      const da = getChecklistItemDisplayDue(a, runNextCycleDue);
      const db = getChecklistItemDisplayDue(b, runNextCycleDue);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }
  return copy;
}

export function wouldCloseCycleBeLate(plannedDueDate: string | undefined): boolean {
  if (!plannedDueDate || plannedDueDate.length < 10) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > plannedDueDate.slice(0, 10);
}

export function downloadChecklistOccurrencesCsv(seriesName: string, occurrences: any[]) {
  const headers = [
    "occurrenceIndex",
    "label",
    "plannedDueDate",
    "closedAt",
    "onTime",
    "lateReason",
    "itemsComplete",
    "itemsTotal",
    "checklistRunId",
  ];
  const escape = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
  const rows = occurrences.map((o) =>
    [
      o.occurrenceIndex,
      o.label ?? "",
      o.plannedDueDate ?? "",
      o.closedAt ?? "",
      o.onTime === undefined ? "" : o.onTime ? "yes" : "no",
      o.lateReason ?? "",
      o.completionComplete ?? "",
      o.completionTotal ?? "",
      o.checklistRunId,
    ].map((v) => escape(String(v))),
  );
  const body = [headers.map(escape).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${seriesName.replace(/[^\w-]+/g, "_").slice(0, 80) || "checklist"}_history.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getStatusLabel(status: ChecklistItemStatus): string {
  if (status === "not_started") return "Not started";
  if (status === "in_progress") return "In progress";
  if (status === "complete") return "Complete";
  return "Blocked";
}
