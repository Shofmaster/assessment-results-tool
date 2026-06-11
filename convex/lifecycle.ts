import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireProjectAccess } from "./_helpers";

/**
 * Slim event-source rows for the per-aircraft lifecycle timeline. The merge/
 * sort lives in the pure builder (src/utils/lifecycleTimeline.ts) so it is
 * unit-testable; this query just projects compact rows for one aircraft.
 */
export const eventsForAircraft = query({
  args: { aircraftId: v.id("aircraftAssets") },
  handler: async (ctx, args) => {
    const aircraft = await ctx.db.get(args.aircraftId);
    if (!aircraft) throw new Error("Aircraft not found");
    await requireProjectAccess(ctx, aircraft.projectId);

    const entries = (await ctx.db
      .query("logbookEntries")
      .withIndex("by_aircraftId_entryDate", (q) => q.eq("aircraftId", args.aircraftId))
      .collect()) as Doc<"logbookEntries">[];

    const components = (await ctx.db
      .query("aircraftComponents")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect()) as Doc<"aircraftComponents">[];

    const discrepancies = (await ctx.db
      .query("aircraftDiscrepancies")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect()) as Doc<"aircraftDiscrepancies">[];

    const form337s = (
      (await ctx.db
        .query("form337Records")
        .withIndex("by_projectId", (q) => q.eq("projectId", aircraft.projectId))
        .collect()) as Doc<"form337Records">[]
    ).filter((f) => String(f.aircraftId ?? "") === String(args.aircraftId));

    return {
      tailNumber: aircraft.tailNumber,
      entries: entries.map((e) => ({
        recordId: String(e._id),
        entryDate: e.entryDate,
        entryType: e.entryType,
        inspectionType: e.inspectionType,
        ataChapter: e.ataChapter,
        workPerformed: (e.workPerformed ?? e.rawText ?? "").slice(0, 200),
        totalTimeAtEntry: e.totalTimeAtEntry,
        signerName: e.signerName,
        adReferences: e.adReferences,
        sbReferences: e.sbReferences,
      })),
      components: components.map((c) => ({
        recordId: String(c._id),
        description: c.description,
        partNumber: c.partNumber,
        serialNumber: c.serialNumber,
        position: c.position,
        installDate: c.installDate,
        removeDate: c.removeDate,
        status: c.status,
        isLifeLimited: c.isLifeLimited,
      })),
      discrepancies: discrepancies.map((d) => ({
        recordId: String(d._id),
        description: (d.description ?? "").slice(0, 200),
        status: d.status,
        category: d.category,
        ataChapter: d.ataChapter,
        discoveredAt: d.discoveredAt,
      })),
      form337s: form337s.map((f) => ({
        recordId: String(f._id),
        title: f.title,
        status: f.status,
        createdAt: f.createdAt,
      })),
    };
  },
});
