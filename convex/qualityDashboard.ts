import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const ISSUE_PAGE = 200;
const ROSTER_PAGE = 500;

/** Calendar schedule next due (aligned with src/types/inspectionSchedule.ts v1). */
function computeNextDueIso(item: {
  lastPerformedAt?: string | null;
  intervalType: string;
  intervalMonths?: number | null;
  intervalDays?: number | null;
}): string | null {
  if (!item.lastPerformedAt || item.intervalType !== "calendar") return null;
  const raw = item.lastPerformedAt.slice(0, 10);
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const last = new Date(Date.UTC(y, m - 1, d));
  const months = item.intervalMonths ?? 0;
  const days = item.intervalDays ?? 0;
  if (months > 0) {
    const next = new Date(last);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next.toISOString().slice(0, 10);
  }
  if (days > 0) {
    const next = new Date(last);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  }
  return null;
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Aggregated readiness data for the Quality command center (Chief Inspector / QM).
 */
export const getCommandCenterSummary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const today = todayIsoUtc();

    const issues = await ctx.db
      .query("entityIssues")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(ISSUE_PAGE);

    const statusCounts: Record<string, number> = {};
    const openLike = new Set(["open", "in_progress", "pending_verification"]);
    const overdueIssues: {
      _id: string;
      carNumber?: string;
      title: string;
      status?: string;
      dueDate?: string;
      severity: string;
    }[] = [];

    for (const issue of issues) {
      const st = issue.status ?? "open";
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
      if (
        issue.dueDate &&
        openLike.has(st) &&
        issue.dueDate.slice(0, 10) < today
      ) {
        overdueIssues.push({
          _id: issue._id,
          carNumber: issue.carNumber,
          title: issue.title,
          status: issue.status,
          dueDate: issue.dueDate,
          severity: issue.severity,
        });
      }
    }

    const assignments = await ctx.db
      .query("rosterAssignments")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(ROSTER_PAGE);

    const personnel = await ctx.db
      .query("rosterPersonnel")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(ROSTER_PAGE);

    const requirementTypes = await ctx.db
      .query("rosterRequirementTypes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(ROSTER_PAGE);

    const personMap = new Map(personnel.map((p) => [p._id, p]));
    const reqMap = new Map(requirementTypes.map((r) => [r._id, r]));

    const overdueRoster: {
      assignmentId: string;
      dueDate: string;
      personName: string;
      requirementName: string;
    }[] = [];

    for (const a of assignments) {
      if (!a.dueDate) continue;
      if (a.dueDate.slice(0, 10) >= today) continue;
      const person = personMap.get(a.personId);
      const req = reqMap.get(a.requirementTypeId);
      if (person && !person.isActive) continue;
      overdueRoster.push({
        assignmentId: a._id,
        dueDate: a.dueDate,
        personName: person?.fullName ?? "Unknown",
        requirementName: req?.name ?? "Requirement",
      });
    }

    const runs = await ctx.db
      .query("auditChecklistRuns")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const activeRuns = runs
      .filter((r) => r.status === "active" || r.status === "draft")
      .slice(0, 20);

    const checklistProgress: {
      runId: string;
      name?: string;
      frameworkLabel: string;
      status: string;
      total: number;
      complete: number;
      inProgress: number;
    }[] = [];

    for (const run of activeRuns) {
      const items = await ctx.db
        .query("auditChecklistItems")
        .withIndex("by_checklistRunId", (q) => q.eq("checklistRunId", run._id))
        .collect();
      const complete = items.filter((i) => i.status === "complete").length;
      const inProgress = items.filter((i) => i.status === "in_progress").length;
      checklistProgress.push({
        runId: run._id,
        name: run.name,
        frameworkLabel: run.frameworkLabel,
        status: run.status,
        total: items.length,
        complete,
        inProgress,
      });
    }

    const scheduleItems = await ctx.db
      .query("inspectionScheduleItems")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const scheduleAlerts: {
      itemId: string;
      title: string;
      nextDue: string;
      kind: "overdue" | "due_soon";
      regulationRef?: string | null;
    }[] = [];

    for (const it of scheduleItems) {
      const next = computeNextDueIso(it);
      if (!next) continue;
      const diff =
        (new Date(next + "T00:00:00Z").getTime() -
          new Date(today + "T00:00:00Z").getTime()) /
        (24 * 60 * 60 * 1000);
      if (diff < 0) {
        scheduleAlerts.push({
          itemId: it._id,
          title: it.title,
          nextDue: next,
          kind: "overdue",
          regulationRef: it.regulationRef,
        });
      } else if (diff <= 30) {
        scheduleAlerts.push({
          itemId: it._id,
          title: it.title,
          nextDue: next,
          kind: "due_soon",
          regulationRef: it.regulationRef,
        });
      }
    }

    scheduleAlerts.sort((a, b) => a.nextDue.localeCompare(b.nextDue));

    return {
      generatedAt: new Date().toISOString(),
      issues: {
        total: issues.length,
        statusCounts,
        overdue: overdueIssues.slice(0, 25),
      },
      roster: {
        overdueAssignments: overdueRoster.slice(0, 25),
      },
      checklists: checklistProgress,
      inspectionSchedule: {
        alerts: scheduleAlerts.slice(0, 30),
      },
    };
  },
});
