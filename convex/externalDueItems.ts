import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireProjectAccess } from "./_helpers";

const MAX_ITEMS_PER_IMPORT = 2000;

const itemValidator = v.object({
  aircraftId: v.id("aircraftAssets"),
  title: v.string(),
  ataChapter: v.optional(v.string()),
  intervalText: v.optional(v.string()),
  lastDoneDate: v.optional(v.string()),
  lastDoneHours: v.optional(v.number()),
  lastDoneCycles: v.optional(v.number()),
  nextDueDate: v.optional(v.string()),
  nextDueHours: v.optional(v.number()),
  nextDueCycles: v.optional(v.number()),
  remainingText: v.optional(v.string()),
});

/**
 * Replace the imported due-list snapshot for a provider. Due lists are
 * snapshots, not ledgers — the prior batch for the same project+provider is
 * deleted and the new rows inserted under one importBatchId.
 */
export const replaceForProvider = mutation({
  args: {
    projectId: v.id("projects"),
    provider: v.string(), // "camp" | "veryon" | "generic"
    reportAsOfDate: v.optional(v.string()),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, args.projectId);
    if (args.items.length > MAX_ITEMS_PER_IMPORT) {
      throw new Error(`Import too large: ${args.items.length} rows (max ${MAX_ITEMS_PER_IMPORT}).`);
    }

    // Every aircraft must belong to this project — never attach rows across tenants.
    const aircraftIds = [...new Set(args.items.map((i) => String(i.aircraftId)))];
    for (const id of aircraftIds) {
      const aircraft = await ctx.db.get(id as never);
      if (!aircraft || String((aircraft as { projectId?: unknown }).projectId) !== String(args.projectId)) {
        throw new Error("An imported row references an aircraft outside this project.");
      }
    }

    const prior = await ctx.db
      .query("externalDueItems")
      .withIndex("by_projectId_provider", (q) =>
        q.eq("projectId", args.projectId).eq("provider", args.provider),
      )
      .collect();
    for (const row of prior) {
      await ctx.db.delete(row._id);
    }

    const importBatchId = `${args.provider}_${Date.now().toString(36)}`;
    const createdAt = new Date().toISOString();
    for (const item of args.items) {
      await ctx.db.insert("externalDueItems", {
        projectId: args.projectId,
        userId,
        provider: args.provider,
        importBatchId,
        reportAsOfDate: args.reportAsOfDate,
        createdAt,
        ...item,
      });
    }
    return { importBatchId, inserted: args.items.length, replaced: prior.length };
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await ctx.db
      .query("externalDueItems")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/** Remove an imported snapshot (all rows for a provider). */
export const clearProvider = mutation({
  args: { projectId: v.id("projects"), provider: v.string() },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = await ctx.db
      .query("externalDueItems")
      .withIndex("by_projectId_provider", (q) =>
        q.eq("projectId", args.projectId).eq("provider", args.provider),
      )
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { removed: rows.length };
  },
});
