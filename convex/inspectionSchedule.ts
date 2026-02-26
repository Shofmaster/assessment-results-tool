import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const itemValidator = v.object({
  sourceDocumentId: v.optional(v.id("documents")),
  sourceDocumentName: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  intervalType: v.string(),
  intervalMonths: v.optional(v.number()),
  intervalDays: v.optional(v.number()),
  intervalValue: v.optional(v.number()),
  regulationRef: v.optional(v.string()),
  isRegulatory: v.optional(v.boolean()),
  lastPerformedAt: v.optional(v.string()),
  lastPerformedSource: v.optional(v.string()),
  documentExcerpt: v.optional(v.string()),
});

/** List all inspection schedule items for a project, optionally sorted by next due date. */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const items = await ctx.db
      .query("inspectionScheduleItems")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return items;
  },
});

/** Bulk add extracted items. */
export const addItems = mutation({
  args: {
    projectId: v.id("projects"),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const item of args.items) {
      const id = await ctx.db.insert("inspectionScheduleItems", {
        projectId: args.projectId,
        userId,
        ...item,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return ids;
  },
});

/** Update last performed date (manual entry). */
export const updateLastPerformed = mutation({
  args: {
    itemId: v.id("inspectionScheduleItems"),
    lastPerformedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Schedule item not found");
    await requireProjectOwner(ctx, item.projectId);
    const now = new Date().toISOString();
    await ctx.db.patch(args.itemId, {
      lastPerformedAt: args.lastPerformedAt,
      lastPerformedSource: "manual",
      updatedAt: now,
    });
    await ctx.db.patch(item.projectId, { updatedAt: now });
  },
});

/** Update item fields (title, interval, category, etc.). */
export const updateItem = mutation({
  args: {
    itemId: v.id("inspectionScheduleItems"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    intervalType: v.optional(v.string()),
    intervalMonths: v.optional(v.number()),
    intervalDays: v.optional(v.number()),
    intervalValue: v.optional(v.number()),
    regulationRef: v.optional(v.string()),
    isRegulatory: v.optional(v.boolean()),
    lastPerformedAt: v.optional(v.string()),
    lastPerformedSource: v.optional(v.string()),
    documentExcerpt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Schedule item not found");
    await requireProjectOwner(ctx, item.projectId);
    const { itemId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.category !== undefined) patch.category = updates.category;
    if (updates.intervalType !== undefined) patch.intervalType = updates.intervalType;
    if (updates.intervalMonths !== undefined) patch.intervalMonths = updates.intervalMonths;
    if (updates.intervalDays !== undefined) patch.intervalDays = updates.intervalDays;
    if (updates.intervalValue !== undefined) patch.intervalValue = updates.intervalValue;
    if (updates.regulationRef !== undefined) patch.regulationRef = updates.regulationRef;
    if (updates.isRegulatory !== undefined) patch.isRegulatory = updates.isRegulatory;
    if (updates.lastPerformedAt !== undefined) patch.lastPerformedAt = updates.lastPerformedAt;
    if (updates.lastPerformedSource !== undefined) patch.lastPerformedSource = updates.lastPerformedSource;
    if (updates.documentExcerpt !== undefined) patch.documentExcerpt = updates.documentExcerpt;
    if (Object.keys(patch).length === 0) return args.itemId;
    const now = new Date().toISOString();
    patch.updatedAt = now;
    await ctx.db.patch(args.itemId, patch);
    await ctx.db.patch(item.projectId, { updatedAt: now });
    return args.itemId;
  },
});

/** Remove an item. */
export const removeItem = mutation({
  args: { itemId: v.id("inspectionScheduleItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Schedule item not found");
    await requireProjectOwner(ctx, item.projectId);
    await ctx.db.delete(args.itemId);
    const now = new Date().toISOString();
    await ctx.db.patch(item.projectId, { updatedAt: now });
  },
});
