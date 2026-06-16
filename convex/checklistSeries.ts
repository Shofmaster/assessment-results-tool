import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";
import { initialRunCounters } from "./lib/checklistRunCounters";

const purposeValidator = v.union(
  v.literal("pre_audit"),
  v.literal("recurring_ops"),
  v.literal("event"),
);

const LATE_REASON_MIN_LEN = 10;

function utcDateOnlyFromIso(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function computeOnTime(closedAtIso: string, plannedDueDate: string | undefined): boolean {
  if (!plannedDueDate || plannedDueDate.length < 10) return true;
  const closed = utcDateOnlyFromIso(closedAtIso);
  const planned = plannedDueDate.slice(0, 10);
  return closed <= planned;
}

async function cloneItemsToRun(
  ctx: any,
  args: {
    sourceRunId: any;
    targetRunId: any;
    projectId: any;
    userId: string;
    framework: string;
    subtypeId?: string;
  },
) {
  const items = await ctx.db
    .query("auditChecklistItems")
    .withIndex("by_checklistRunId", (q: any) => q.eq("checklistRunId", args.sourceRunId))
    .collect();
  const now = new Date().toISOString();
  for (const it of items) {
    await ctx.db.insert("auditChecklistItems", {
      projectId: args.projectId,
      userId: args.userId,
      checklistRunId: args.targetRunId,
      framework: args.framework,
      subtypeId: args.subtypeId ?? it.subtypeId,
      section: it.section,
      title: it.title,
      description: it.description,
      requirementRef: it.requirementRef,
      evidenceHint: it.evidenceHint,
      severity: it.severity,
      status: "not_started",
      owner: it.owner,
      dueDate: undefined,
      intervalMonths: it.intervalMonths,
      intervalDays: it.intervalDays,
      lastPerformedAt: undefined,
      notes: undefined,
      sourceType: it.sourceType,
      responseType: it.responseType,
      pointValue: it.pointValue,
      sourceDocumentId: it.sourceDocumentId,
      sourceDocumentName: it.sourceDocumentName,
      createdAt: now,
      updatedAt: now,
    });
  }
  return items.length;
}

export const listSeriesByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("checklistSeries")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listOccurrencesBySeries = query({
  args: { seriesId: v.id("checklistSeries") },
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) throw new Error("Checklist series not found");
    await requireProjectOwner(ctx, series.projectId);
    const rows = await ctx.db
      .query("checklistOccurrences")
      .withIndex("by_seriesId", (q) => q.eq("seriesId", args.seriesId))
      .collect();
    rows.sort((a, b) => b.occurrenceIndex - a.occurrenceIndex);
    return rows;
  },
});

export const getSeriesForRun = query({
  args: { checklistRunId: v.id("auditChecklistRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) return null;
    await requireProjectOwner(ctx, run.projectId);
    if (!run.checklistSeriesId) return null;
    const series = await ctx.db.get(run.checklistSeriesId);
    return series ?? null;
  },
});

export const getOccurrenceForRun = query({
  args: { checklistRunId: v.id("auditChecklistRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) return null;
    await requireProjectOwner(ctx, run.projectId);
    if (!run.checklistOccurrenceId) return null;
    return await ctx.db.get(run.checklistOccurrenceId);
  },
});

/** Attach the current run to a new series (first occurrence). */
export const createSeriesAndLinkRun = mutation({
  args: {
    checklistRunId: v.id("auditChecklistRuns"),
    name: v.string(),
    purpose: purposeValidator,
    isRecurring: v.boolean(),
    intervalMonths: v.optional(v.number()),
    intervalDays: v.optional(v.number()),
    plannedDueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    const userId = await requireProjectOwner(ctx, run.projectId);
    if (run.checklistSeriesId) {
      throw new Error("This run is already part of a checklist series");
    }
    const now = new Date().toISOString();
    const seriesId = await ctx.db.insert("checklistSeries", {
      projectId: run.projectId,
      userId,
      name: args.name.trim(),
      purpose: args.purpose,
      isRecurring: args.isRecurring,
      intervalMonths: args.intervalMonths && args.intervalMonths > 0 ? args.intervalMonths : undefined,
      intervalDays: args.intervalDays && args.intervalDays > 0 ? args.intervalDays : undefined,
      framework: run.framework,
      frameworkLabel: run.frameworkLabel,
      subtypeId: run.subtypeId,
      subtypeLabel: run.subtypeLabel,
      generatedFromTemplateVersion: run.generatedFromTemplateVersion,
      notes: run.notes,
      createdAt: now,
      updatedAt: now,
    });

    const planned =
      args.plannedDueDate?.trim().slice(0, 10) ||
      run.nextCycleDue ||
      undefined;

    const occurrenceId = await ctx.db.insert("checklistOccurrences", {
      projectId: run.projectId,
      userId,
      seriesId,
      checklistRunId: run._id,
      occurrenceIndex: 1,
      label: "Cycle 1",
      plannedDueDate: planned,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(run._id, {
      checklistSeriesId: seriesId,
      checklistOccurrenceId: occurrenceId,
      checklistPurpose: args.purpose,
      nextCycleDue: planned,
      runIntervalMonths: args.intervalMonths && args.intervalMonths > 0 ? args.intervalMonths : undefined,
      runIntervalDays: args.intervalDays && args.intervalDays > 0 ? args.intervalDays : undefined,
      updatedAt: now,
    });
    await ctx.db.patch(seriesId, { updatedAt: now });
    await ctx.db.patch(run.projectId, { updatedAt: now });
    return { seriesId, occurrenceId };
  },
});

export const closeOccurrence = mutation({
  args: {
    occurrenceId: v.id("checklistOccurrences"),
    lateReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const occ = await ctx.db.get(args.occurrenceId);
    if (!occ) throw new Error("Occurrence not found");
    await requireProjectOwner(ctx, occ.projectId);
    if (occ.closedAt) throw new Error("This cycle is already closed");

    const run = await ctx.db.get(occ.checklistRunId);
    if (!run) throw new Error("Checklist run not found");

    const items = await ctx.db
      .query("auditChecklistItems")
      .withIndex("by_checklistRunId", (q) => q.eq("checklistRunId", occ.checklistRunId))
      .collect();

    if (items.length === 0) {
      throw new Error("No checklist items — cannot close an empty cycle");
    }

    const incomplete = items.filter((i: any) => i.status !== "complete");
    if (incomplete.length > 0) {
      throw new Error(`Cannot close: ${incomplete.length} item(s) are not marked complete`);
    }

    const closedAt = new Date().toISOString();
    const onTime = computeOnTime(closedAt, occ.plannedDueDate);
    const lateReason = (args.lateReason ?? "").trim();

    if (!onTime && lateReason.length < LATE_REASON_MIN_LEN) {
      throw new Error(
        `This cycle is late (closed after planned due ${occ.plannedDueDate?.slice(0, 10) ?? "n/a"}). Enter a reason (at least ${LATE_REASON_MIN_LEN} characters).`,
      );
    }

    // Compute compliance score at close time
    let earnedPts = 0;
    let maxPts = 0;
    for (const i of items as any[]) {
      const pv = i.pointValue ?? 1;
      if (i.responseType === "pass_fail_na") {
        if (i.passFail === "na") continue;
        maxPts += pv;
        if (i.passFail === "pass") earnedPts += pv;
      } else if (i.pointValue != null) {
        maxPts += pv;
        if (i.status === "complete") earnedPts += pv;
      }
    }
    const complianceScore = maxPts > 0 ? Math.round((earnedPts / maxPts) * 100) : undefined;

    const now = new Date().toISOString();
    await ctx.db.patch(args.occurrenceId, {
      closedAt,
      onTime,
      lateReason: onTime ? undefined : lateReason,
      completionTotal: items.length,
      completionComplete: items.filter((i: any) => i.status === "complete").length,
      complianceScore,
      updatedAt: now,
    });

    await ctx.db.patch(run._id, {
      status: "archived",
      completedAt: closedAt,
      updatedAt: now,
    });
    await ctx.db.patch(occ.seriesId, { updatedAt: now });
    await ctx.db.patch(occ.projectId, { updatedAt: now });
    return args.occurrenceId;
  },
});

/** After the latest occurrence is closed, start a new run with cloned items. */
export const startNextCycle = mutation({
  args: {
    seriesId: v.id("checklistSeries"),
    plannedDueDate: v.optional(v.string()),
    cycleLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) throw new Error("Series not found");
    const userId = await requireProjectOwner(ctx, series.projectId);

    const occs = await ctx.db
      .query("checklistOccurrences")
      .withIndex("by_seriesId", (q) => q.eq("seriesId", args.seriesId))
      .collect();
    if (occs.length === 0) throw new Error("No occurrences for this series");

    const maxIdx = Math.max(...occs.map((o) => o.occurrenceIndex));
    const latest = occs.find((o) => o.occurrenceIndex === maxIdx);
    if (!latest) throw new Error("Could not find latest occurrence");
    if (!latest.closedAt) {
      throw new Error("Close the current cycle before starting the next one");
    }

    const sourceRun = await ctx.db.get(latest.checklistRunId);
    if (!sourceRun) throw new Error("Previous run not found");

    const now = new Date().toISOString();
    let nextDue =
      args.plannedDueDate?.trim().slice(0, 10) || undefined;
    if (!nextDue && (series.intervalMonths || series.intervalDays) && latest.closedAt) {
      const base = latest.closedAt.slice(0, 10);
      const [y, m, d] = base.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const months = series.intervalMonths ?? 0;
      const days = series.intervalDays ?? 0;
      if (months > 0) {
        dt.setUTCMonth(dt.getUTCMonth() + months);
      } else if (days > 0) {
        dt.setUTCDate(dt.getUTCDate() + days);
      }
      nextDue = dt.toISOString().slice(0, 10);
    }

    const newRunId = await ctx.db.insert("auditChecklistRuns", {
      projectId: series.projectId,
      userId,
      profileId: sourceRun.profileId,
      name: sourceRun.name,
      framework: series.framework,
      frameworkLabel: series.frameworkLabel,
      subtypeId: series.subtypeId,
      subtypeLabel: series.subtypeLabel,
      status: "active",
      generatedFromTemplateVersion: series.generatedFromTemplateVersion,
      notes: series.notes,
      checklistSeriesId: series._id,
      checklistPurpose: series.purpose,
      nextCycleDue: nextDue,
      runIntervalMonths: series.intervalMonths,
      runIntervalDays: series.intervalDays,
      createdAt: now,
      updatedAt: now,
    });

    const clonedCount = await cloneItemsToRun(ctx, {
      sourceRunId: latest.checklistRunId,
      targetRunId: newRunId,
      projectId: series.projectId,
      userId,
      framework: series.framework,
      subtypeId: series.subtypeId,
    });

    const occurrenceId = await ctx.db.insert("checklistOccurrences", {
      projectId: series.projectId,
      userId,
      seriesId: series._id,
      checklistRunId: newRunId,
      occurrenceIndex: maxIdx + 1,
      label: args.cycleLabel?.trim() || `Cycle ${maxIdx + 1}`,
      plannedDueDate: nextDue,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(newRunId, {
      checklistOccurrenceId: occurrenceId,
      ...initialRunCounters(clonedCount),
      updatedAt: now,
    });
    await ctx.db.patch(series._id, { updatedAt: now });
    await ctx.db.patch(series.projectId, { updatedAt: now });

    return { runId: newRunId, occurrenceId };
  },
});

export const updateSeries = mutation({
  args: {
    seriesId: v.id("checklistSeries"),
    name: v.optional(v.string()),
    intervalMonths: v.optional(v.number()),
    intervalDays: v.optional(v.number()),
    isRecurring: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId);
    if (!series) throw new Error("Series not found");
    await requireProjectOwner(ctx, series.projectId);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.isRecurring !== undefined) patch.isRecurring = args.isRecurring;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.intervalMonths !== undefined) {
      patch.intervalMonths = args.intervalMonths > 0 ? args.intervalMonths : undefined;
    }
    if (args.intervalDays !== undefined) {
      patch.intervalDays = args.intervalDays > 0 ? args.intervalDays : undefined;
    }
    await ctx.db.patch(args.seriesId, patch);
    await ctx.db.patch(series.projectId, { updatedAt: now });
    return args.seriesId;
  },
});

/** Update planned due for the open occurrence + run (for current cycle only). */
export const updateOpenOccurrencePlannedDue = mutation({
  args: {
    occurrenceId: v.id("checklistOccurrences"),
    plannedDueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const occ = await ctx.db.get(args.occurrenceId);
    if (!occ) throw new Error("Occurrence not found");
    await requireProjectOwner(ctx, occ.projectId);
    if (occ.closedAt) throw new Error("Cannot change planned due on a closed cycle");
    const planned = args.plannedDueDate.trim().slice(0, 10);
    const now = new Date().toISOString();
    await ctx.db.patch(args.occurrenceId, { plannedDueDate: planned, updatedAt: now });
    await ctx.db.patch(occ.checklistRunId, { nextCycleDue: planned, updatedAt: now });
    await ctx.db.patch(occ.projectId, { updatedAt: now });
    return args.occurrenceId;
  },
});

import { internalMutation } from "./_generated/server";

/**
 * Daily cron: for every recurring series whose nextCycleDue has passed and
 * which has no open (active) occurrence, auto-start the next cycle.
 */
export const autoAdvanceOverdueSeries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);

    // Find all open occurrences to know which series are already active
    const openOccurrences = await ctx.db
      .query("checklistOccurrences")
      .filter((q: any) => q.eq(q.field("closedAt"), undefined))
      .collect();
    const seriesWithOpenCycle = new Set(openOccurrences.map((o: any) => o.checklistSeriesId));

    // Get all recurring series
    const allSeries = await ctx.db.query("checklistSeries").collect();
    let advanced = 0;

    for (const series of allSeries) {
      if (!series.isRecurring) continue;
      if (seriesWithOpenCycle.has(series._id)) continue;

      // Find the most recent run for this series to check nextCycleDue
      const runs = await ctx.db
        .query("auditChecklistRuns")
        .withIndex("by_projectId", (q: any) => q.eq("projectId", series.projectId))
        .collect();
      const seriesRun = runs
        .filter((r: any) => r.checklistSeriesId === series._id)
        .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))[0];

      if (!seriesRun) continue;
      const due = seriesRun.nextCycleDue;
      if (!due || due > today) continue;

      // Auto-start next cycle — reuse the existing startNextCycle logic inline
      const now = new Date().toISOString();
      const months = seriesRun.runIntervalMonths ?? 0;
      const days = seriesRun.runIntervalDays ?? 0;

      let nextDue: string | undefined;
      if (months > 0) {
        const d = new Date(due);
        d.setUTCMonth(d.getUTCMonth() + months);
        nextDue = d.toISOString().slice(0, 10);
      } else if (days > 0) {
        const d = new Date(due);
        d.setUTCDate(d.getUTCDate() + days);
        nextDue = d.toISOString().slice(0, 10);
      }

      const newRunId = await ctx.db.insert("auditChecklistRuns", {
        projectId: series.projectId,
        userId: seriesRun.userId,
        profileId: seriesRun.profileId,
        certificateProfileId: seriesRun.certificateProfileId,
        framework: seriesRun.framework,
        frameworkLabel: seriesRun.frameworkLabel,
        subtypeId: seriesRun.subtypeId,
        subtypeLabel: seriesRun.subtypeLabel,
        name: seriesRun.name,
        status: "active",
        generatedFromTemplateVersion: seriesRun.generatedFromTemplateVersion,
        checklistSeriesId: series._id,
        checklistPurpose: seriesRun.checklistPurpose,
        nextCycleDue: nextDue,
        runIntervalMonths: months > 0 ? months : undefined,
        runIntervalDays: days > 0 ? days : undefined,
        sectionOrder: seriesRun.sectionOrder,
        createdAt: now,
        updatedAt: now,
      });

      // Clone items
      const items = await ctx.db
        .query("auditChecklistItems")
        .withIndex("by_checklistRunId", (q: any) => q.eq("checklistRunId", seriesRun._id))
        .collect();
      for (const item of items) {
        await ctx.db.insert("auditChecklistItems", {
          projectId: series.projectId,
          userId: seriesRun.userId,
          framework: seriesRun.framework,
          checklistRunId: newRunId,
          section: item.section,
          title: item.title,
          description: item.description,
          requirementRef: item.requirementRef,
          evidenceHint: item.evidenceHint,
          severity: item.severity,
          status: "not_started",
          responseType: item.responseType,
          pointValue: item.pointValue,
          requiresEvidence: item.requiresEvidence,
          intervalMonths: item.intervalMonths,
          intervalDays: item.intervalDays,
          createdAt: now,
          updatedAt: now,
        });
      }

      const closedSeriesOccs = openOccurrences.filter((o: any) => o.seriesId === series._id);
      const occId = await ctx.db.insert("checklistOccurrences", {
        seriesId: series._id,
        checklistRunId: newRunId,
        projectId: series.projectId,
        userId: seriesRun.userId,
        occurrenceIndex: closedSeriesOccs.length + 1,
        plannedDueDate: nextDue,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(newRunId, { checklistOccurrenceId: occId, updatedAt: now });
      advanced++;
    }

    return { advanced };
  },
});
