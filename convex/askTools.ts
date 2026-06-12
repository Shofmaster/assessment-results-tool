import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectAccess } from "./_helpers";

/**
 * Slim, access-controlled queries backing the Ask an Expert record tools.
 * Each returns compact rows (no rawText, no parse metadata) sized for a tool
 * result the model reads. The client-side executor allocates citation tags.
 */

function normalizeTail(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function listProjectAircraft(
  ctx: { db: { query: (t: "aircraftAssets") => any } },
  projectId: Id<"projects">,
): Promise<Doc<"aircraftAssets">[]> {
  const rows = (await (ctx as any).db
    .query("aircraftAssets")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .collect()) as Doc<"aircraftAssets">[];
  return rows.filter((a) => (a.status ?? "active") === "active");
}

function filterByTail(
  aircraft: Doc<"aircraftAssets">[],
  tailNumber: string | undefined,
): Doc<"aircraftAssets">[] {
  if (!tailNumber) return aircraft;
  const wanted = normalizeTail(tailNumber);
  return aircraft.filter((a) => normalizeTail(a.tailNumber) === wanted);
}

export const aircraftStatus = query({
  args: { projectId: v.id("projects"), tailNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const aircraft = filterByTail(await listProjectAircraft(ctx, args.projectId), args.tailNumber);
    return aircraft.map((a) => ({
      recordId: String(a._id),
      tailNumber: a.tailNumber,
      make: a.make,
      model: a.model,
      serial: a.serial,
      totalTime: a.currentTotalTime ?? a.baselineTotalTime,
      totalCycles: a.currentTotalCycles ?? a.baselineTotalCycles,
      totalLandings: a.currentTotalLandings ?? a.baselineTotalLandings,
      asOfDate: a.currentAsOfDate ?? a.baselineAsOfDate,
    }));
  },
});

export const logbookEntriesForAsk = query({
  args: {
    projectId: v.id("projects"),
    tailNumber: v.optional(v.string()),
    textContains: v.optional(v.string()),
    ataChapter: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const aircraft = filterByTail(await listProjectAircraft(ctx, args.projectId), args.tailNumber);
    const tailById = new Map(aircraft.map((a) => [String(a._id), a.tailNumber]));
    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    const needle = (args.textContains ?? "").trim().toLowerCase();
    const ata = (args.ataChapter ?? "").trim();

    const all: Doc<"logbookEntries">[] = [];
    for (const a of aircraft) {
      const rows = (await ctx.db
        .query("logbookEntries")
        .withIndex("by_aircraftId_entryDate", (q) => q.eq("aircraftId", a._id))
        .collect()) as Doc<"logbookEntries">[];
      all.push(...rows);
    }

    const filtered = all
      .filter((e) => {
        if (args.dateFrom && (e.entryDate ?? "") < args.dateFrom) return false;
        if (args.dateTo && (e.entryDate ?? "") > args.dateTo) return false;
        if (ata && (e.ataChapter ?? "").replace(/^0+/, "") !== ata.replace(/^0+/, "")) return false;
        if (needle) {
          const haystack = `${e.workPerformed ?? ""} ${e.rawText ?? ""} ${e.inspectionType ?? ""}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.entryDate ?? "").localeCompare(a.entryDate ?? ""))
      .slice(0, limit);

    return filtered.map((e) => ({
      recordId: String(e._id),
      tailNumber: tailById.get(String(e.aircraftId)),
      entryDate: e.entryDate,
      entryType: e.entryType,
      inspectionType: e.inspectionType,
      ataChapter: e.ataChapter,
      workPerformed: (e.workPerformed ?? e.rawText ?? "").slice(0, 300),
      totalTimeAtEntry: e.totalTimeAtEntry,
      signerName: e.signerName,
      nextDueDate: e.nextDueDate,
      recurrenceInterval: e.recurrenceInterval,
      recurrenceUnit: e.recurrenceUnit,
    }));
  },
});

export const componentsForAsk = query({
  args: { projectId: v.id("projects"), tailNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const aircraft = filterByTail(await listProjectAircraft(ctx, args.projectId), args.tailNumber);
    const tailById = new Map(aircraft.map((a) => [String(a._id), a.tailNumber]));
    const out: Array<Record<string, unknown>> = [];
    for (const a of aircraft) {
      const rows = (await ctx.db
        .query("aircraftComponents")
        .withIndex("by_aircraftId_status", (q) => q.eq("aircraftId", a._id).eq("status", "installed"))
        .collect()) as Doc<"aircraftComponents">[];
      for (const c of rows) {
        out.push({
          recordId: String(c._id),
          tailNumber: tailById.get(String(c.aircraftId)),
          partNumber: c.partNumber,
          serialNumber: c.serialNumber,
          description: c.description,
          ataChapter: c.ataChapter,
          position: c.position,
          isLifeLimited: c.isLifeLimited,
          lifeLimit: c.lifeLimit,
          lifeLimitUnit: c.lifeLimitUnit,
          installDate: c.installDate,
          tsnAtInstall: c.tsnAtInstall,
          aircraftTimeAtInstall: c.aircraftTimeAtInstall,
        });
      }
    }
    return out;
  },
});

export const discrepanciesForAsk = query({
  args: {
    projectId: v.id("projects"),
    tailNumber: v.optional(v.string()),
    status: v.optional(v.string()), // "open" | "deferred" | "resolved" | "closed"
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const aircraft = filterByTail(await listProjectAircraft(ctx, args.projectId), args.tailNumber);
    const tailById = new Map(aircraft.map((a) => [String(a._id), a.tailNumber]));
    const aircraftIds = new Set(aircraft.map((a) => String(a._id)));
    const rows = (await ctx.db
      .query("aircraftDiscrepancies")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()) as Doc<"aircraftDiscrepancies">[];
    return rows
      .filter((d) => aircraftIds.has(String(d.aircraftId)))
      .filter((d) => !args.status || d.status === args.status)
      .slice(0, 50)
      .map((d) => ({
        recordId: String(d._id),
        tailNumber: tailById.get(String(d.aircraftId)),
        status: d.status,
        category: d.category,
        ataChapter: d.ataChapter,
        melItem: d.melItem,
        description: (d.description ?? "").slice(0, 300),
        discoveredAt: d.discoveredAt,
        deferralExpiresAt: d.deferralExpiresAt,
      }));
  },
});
