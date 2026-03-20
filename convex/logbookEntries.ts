import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireLogbookEnabled, requireProjectAccess } from "./_helpers";

const entryValidator = v.object({
  aircraftId: v.id("aircraftAssets"),
  sourceDocumentId: v.optional(v.id("documents")),
  sourcePage: v.optional(v.number()),
  rawText: v.string(),
  entryDate: v.optional(v.string()),
  workPerformed: v.optional(v.string()),
  ataChapter: v.optional(v.string()),
  adReferences: v.optional(v.array(v.string())),
  sbReferences: v.optional(v.array(v.string())),
  adSbReferences: v.optional(v.array(v.string())),
  totalTimeAtEntry: v.optional(v.number()),
  totalCyclesAtEntry: v.optional(v.number()),
  totalLandingsAtEntry: v.optional(v.number()),
  signerName: v.optional(v.string()),
  signerCertNumber: v.optional(v.string()),
  signerCertType: v.optional(v.string()),
  returnToServiceStatement: v.optional(v.string()),
  hasReturnToService: v.optional(v.boolean()),
  entryType: v.optional(v.string()),
  confidence: v.optional(v.number()),
  fieldConfidence: v.optional(v.any()),
  userVerified: v.optional(v.boolean()),
});

export const listByAircraft = query({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    await requireProjectAccess(ctx, args.projectId);
    return ctx.db
      .query("logbookEntries")
      .withIndex("by_aircraftId_entryDate", (q) => q.eq("aircraftId", args.aircraftId))
      .collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    await requireProjectAccess(ctx, args.projectId);
    return ctx.db
      .query("logbookEntries")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const get = query({
  args: { entryId: v.id("logbookEntries") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) return null;
    await requireProjectAccess(ctx, entry.projectId);
    return entry;
  },
});

export const search = query({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.optional(v.id("aircraftAssets")),
    searchText: v.optional(v.string()),
    entryType: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    await requireProjectAccess(ctx, args.projectId);

    let entries = args.aircraftId
      ? await ctx.db
          .query("logbookEntries")
          .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId!))
          .collect()
      : await ctx.db
          .query("logbookEntries")
          .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
          .collect();

    if (args.entryType) {
      entries = entries.filter((e) => e.entryType === args.entryType);
    }
    if (args.dateFrom) {
      entries = entries.filter((e) => e.entryDate && e.entryDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      entries = entries.filter((e) => e.entryDate && e.entryDate <= args.dateTo!);
    }
    if (args.searchText) {
      const lower = args.searchText.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.rawText.toLowerCase().includes(lower) ||
          (e.workPerformed && e.workPerformed.toLowerCase().includes(lower)) ||
          (e.signerName && e.signerName.toLowerCase().includes(lower)) ||
          (e.adReferences && e.adReferences.some((r) => r.toLowerCase().includes(lower))) ||
          (e.sbReferences && e.sbReferences.some((r) => r.toLowerCase().includes(lower))) ||
          (e.adSbReferences && e.adSbReferences.some((r) => r.toLowerCase().includes(lower)))
      );
    }
    return entries;
  },
});

export const addBatch = mutation({
  args: {
    projectId: v.id("projects"),
    entries: v.array(entryValidator),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireProjectAccess(ctx, args.projectId);
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const entry of args.entries) {
      const id = await ctx.db.insert("logbookEntries", {
        projectId: args.projectId,
        userId,
        ...entry,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return ids;
  },
});

export const update = mutation({
  args: {
    entryId: v.id("logbookEntries"),
    entryDate: v.optional(v.string()),
    workPerformed: v.optional(v.string()),
    ataChapter: v.optional(v.string()),
    adReferences: v.optional(v.array(v.string())),
    sbReferences: v.optional(v.array(v.string())),
    adSbReferences: v.optional(v.array(v.string())),
    totalTimeAtEntry: v.optional(v.number()),
    totalCyclesAtEntry: v.optional(v.number()),
    totalLandingsAtEntry: v.optional(v.number()),
    signerName: v.optional(v.string()),
    signerCertNumber: v.optional(v.string()),
    signerCertType: v.optional(v.string()),
    returnToServiceStatement: v.optional(v.string()),
    hasReturnToService: v.optional(v.boolean()),
    entryType: v.optional(v.string()),
    userVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Logbook entry not found");
    await requireProjectAccess(ctx, entry.projectId);
    const { entryId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) patch[key] = val;
    }
    if (Object.keys(patch).length === 0) return entryId;
    if ((patch.adReferences === undefined || (Array.isArray(patch.adReferences) && patch.adReferences.length === 0)) &&
        (patch.sbReferences === undefined || (Array.isArray(patch.sbReferences) && patch.sbReferences.length === 0)) &&
        patch.adSbReferences !== undefined &&
        Array.isArray(patch.adSbReferences)) {
      patch.adReferences = patch.adSbReferences.filter((ref) => /^AD\b/i.test(ref));
      patch.sbReferences = patch.adSbReferences.filter((ref) => /^SB\b/i.test(ref));
    }
    if ((patch.adReferences !== undefined || patch.sbReferences !== undefined) &&
        patch.adSbReferences === undefined) {
      const adRefs = Array.isArray(patch.adReferences) ? patch.adReferences : [];
      const sbRefs = Array.isArray(patch.sbReferences) ? patch.sbReferences : [];
      patch.adSbReferences = Array.from(new Set([...adRefs, ...sbRefs]));
    }
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(entryId, patch);
    return entryId;
  },
});

export const remove = mutation({
  args: { entryId: v.id("logbookEntries") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Logbook entry not found");
    await requireProjectAccess(ctx, entry.projectId);
    await ctx.db.delete(args.entryId);
  },
});
