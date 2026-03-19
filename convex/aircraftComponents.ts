import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByAircraft = query({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    statusFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    if (args.statusFilter) {
      return ctx.db
        .query("aircraftComponents")
        .withIndex("by_aircraftId_status", (q) =>
          q.eq("aircraftId", args.aircraftId).eq("status", args.statusFilter!)
        )
        .collect();
    }
    return ctx.db
      .query("aircraftComponents")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect();
  },
});

export const get = query({
  args: { componentId: v.id("aircraftComponents") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.componentId);
    if (!comp) return null;
    await requireProjectOwner(ctx, comp.projectId);
    return comp;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    partNumber: v.string(),
    serialNumber: v.optional(v.string()),
    description: v.string(),
    ataChapter: v.optional(v.string()),
    position: v.optional(v.string()),
    isLifeLimited: v.optional(v.boolean()),
    lifeLimit: v.optional(v.number()),
    lifeLimitUnit: v.optional(v.string()),
    tsnAtInstall: v.optional(v.number()),
    tsoAtInstall: v.optional(v.number()),
    cyclesAtInstall: v.optional(v.number()),
    aircraftTimeAtInstall: v.optional(v.number()),
    aircraftCyclesAtInstall: v.optional(v.number()),
    installDate: v.optional(v.string()),
    installLogbookEntryId: v.optional(v.id("logbookEntries")),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return ctx.db.insert("aircraftComponents", {
      ...args,
      userId,
      status: "installed",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    componentId: v.id("aircraftComponents"),
    partNumber: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    ataChapter: v.optional(v.string()),
    position: v.optional(v.string()),
    isLifeLimited: v.optional(v.boolean()),
    lifeLimit: v.optional(v.number()),
    lifeLimitUnit: v.optional(v.string()),
    tsnAtInstall: v.optional(v.number()),
    tsoAtInstall: v.optional(v.number()),
    cyclesAtInstall: v.optional(v.number()),
    aircraftTimeAtInstall: v.optional(v.number()),
    aircraftCyclesAtInstall: v.optional(v.number()),
    installDate: v.optional(v.string()),
    removeDate: v.optional(v.string()),
    removeLogbookEntryId: v.optional(v.id("logbookEntries")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.componentId);
    if (!comp) throw new Error("Component not found");
    await requireProjectOwner(ctx, comp.projectId);
    const { componentId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) patch[key] = val;
    }
    if (Object.keys(patch).length === 0) return componentId;
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(componentId, patch);
    return componentId;
  },
});

export const remove = mutation({
  args: { componentId: v.id("aircraftComponents") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.componentId);
    if (!comp) throw new Error("Component not found");
    await requireProjectOwner(ctx, comp.projectId);
    await ctx.db.delete(args.componentId);
  },
});
