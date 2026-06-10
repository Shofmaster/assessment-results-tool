import { query, mutation, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireProjectAccess } from "./_helpers";

/**
 * Slim source rows for due-list forecasting. The forecast math itself lives in
 * the pure engine (src/utils/dueForecast.ts) and runs on the caller — this
 * just joins and projects the native sources plus aircraft utilization, so
 * payloads stay small (no rawText, no parse metadata).
 *
 * NO access control here — callers authorize first (project access for the
 * dashboard query, capability token for the iCal feed).
 */
export async function collectDueSources(ctx: QueryCtx, projectId: Id<"projects">) {
  {
    const args = { projectId };

    const aircraftRows = await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const activeAircraft = aircraftRows.filter((a) => (a.status ?? "active") === "active");

    const aircraft = activeAircraft.map((a) => ({
      aircraftId: String(a._id),
      tailNumber: a.tailNumber,
      baselineTotalTime: a.baselineTotalTime,
      baselineTotalCycles: a.baselineTotalCycles,
      baselineTotalLandings: a.baselineTotalLandings,
      baselineAsOfDate: a.baselineAsOfDate,
      currentTotalTime: a.currentTotalTime,
      currentTotalCycles: a.currentTotalCycles,
      currentTotalLandings: a.currentTotalLandings,
      currentAsOfDate: a.currentAsOfDate,
      estDailyHours: a.estDailyHours,
      estDailyCycles: a.estDailyCycles,
      estDailyLandings: a.estDailyLandings,
    }));
    const activeIds = new Set(aircraft.map((a) => a.aircraftId));

    const scheduleRows = await ctx.db
      .query("inspectionScheduleItems")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const scheduleItems = scheduleRows.map((s) => ({
      kind: "schedule" as const,
      sourceId: String(s._id),
      title: s.title,
      intervalType: s.intervalType,
      intervalMonths: s.intervalMonths ?? undefined,
      intervalDays: s.intervalDays ?? undefined,
      intervalValue: s.intervalValue ?? undefined,
      lastPerformedAt: s.lastPerformedAt ?? undefined,
      regulationRef: s.regulationRef ?? undefined,
    }));

    const entryRows = await ctx.db
      .query("logbookEntries")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const recurringEntries = entryRows
      .filter(
        (e) =>
          activeIds.has(String(e.aircraftId)) &&
          (e.nextDueDate || (e.recurrenceUnit && (e.recurrenceInterval ?? 0) > 0)),
      )
      .map((e) => ({
        kind: "logbook" as const,
        sourceId: String(e._id),
        aircraftId: String(e.aircraftId),
        title:
          (e.inspectionType ? `${e.inspectionType.replace(/_/g, " ")} inspection` : undefined) ||
          (e.workPerformed || "").slice(0, 120) ||
          "Recurring logbook item",
        ataChapter: e.ataChapter,
        entryDate: e.entryDate,
        nextDueDate: e.nextDueDate,
        recurrenceInterval: e.recurrenceInterval,
        recurrenceUnit: e.recurrenceUnit,
        totalTimeAtEntry: e.totalTimeAtEntry,
        totalCyclesAtEntry: e.totalCyclesAtEntry,
        totalLandingsAtEntry: e.totalLandingsAtEntry,
      }));

    const components: Array<Record<string, unknown>> = [];
    for (const a of activeAircraft) {
      const rows = await ctx.db
        .query("aircraftComponents")
        .withIndex("by_aircraftId_status", (q) => q.eq("aircraftId", a._id).eq("status", "installed"))
        .collect();
      for (const c of rows) {
        if (c.isLifeLimited !== true) continue;
        components.push({
          kind: "component" as const,
          sourceId: String(c._id),
          aircraftId: String(c.aircraftId),
          title: `${c.description || c.partNumber}${c.position ? ` (${c.position})` : ""}`,
          ataChapter: c.ataChapter,
          lifeLimit: c.lifeLimit,
          lifeLimitUnit: c.lifeLimitUnit,
          tsnAtInstall: c.tsnAtInstall,
          tsoAtInstall: c.tsoAtInstall,
          cyclesAtInstall: c.cyclesAtInstall,
          aircraftTimeAtInstall: c.aircraftTimeAtInstall,
          aircraftCyclesAtInstall: c.aircraftCyclesAtInstall,
          installDate: c.installDate,
        });
      }
    }

    const externalRows = await ctx.db
      .query("externalDueItems")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const externalItems = externalRows
      .filter((x) => activeIds.has(String(x.aircraftId)))
      .map((x) => ({
        sourceId: String(x._id),
        aircraftId: String(x.aircraftId),
        provider: x.provider,
        reportAsOfDate: x.reportAsOfDate,
        title: x.title,
        ataChapter: x.ataChapter,
        intervalText: x.intervalText,
        nextDueDate: x.nextDueDate,
        nextDueHours: x.nextDueHours,
        nextDueCycles: x.nextDueCycles,
        remainingText: x.remainingText,
      }));

    return { aircraft, scheduleItems, recurringEntries, components, externalItems };
  }
}

export const sourcesForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await collectDueSources(ctx, args.projectId);
  },
});

/** Update the manual utilization-rate overrides for an aircraft. */
export const setEstimatedDailyRates = mutation({
  args: {
    aircraftId: v.id("aircraftAssets"),
    estDailyHours: v.optional(v.union(v.number(), v.null())),
    estDailyCycles: v.optional(v.union(v.number(), v.null())),
    estDailyLandings: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const aircraft = await ctx.db.get(args.aircraftId);
    if (!aircraft) throw new Error("Aircraft not found");
    await requireProjectAccess(ctx, aircraft.projectId);
    const normalize = (value: number | null | undefined): number | undefined => {
      if (value === null) return undefined; // null clears the override
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
      return value;
    };
    await ctx.db.patch(args.aircraftId, {
      ...(args.estDailyHours !== undefined ? { estDailyHours: normalize(args.estDailyHours) } : {}),
      ...(args.estDailyCycles !== undefined ? { estDailyCycles: normalize(args.estDailyCycles) } : {}),
      ...(args.estDailyLandings !== undefined ? { estDailyLandings: normalize(args.estDailyLandings) } : {}),
      updatedAt: new Date().toISOString(),
    });
  },
});
