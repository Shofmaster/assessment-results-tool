import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireProjectOwner } from "./_helpers";

const itemValidator = v.object({
  sourceDocumentId: v.optional(v.union(v.id("documents"), v.string())),
  sourceDocumentName: v.optional(v.union(v.string(), v.null())),
  title: v.string(),
  description: v.optional(v.union(v.string(), v.null())),
  category: v.optional(v.union(v.string(), v.null())),
  intervalType: v.string(),
  intervalMonths: v.optional(v.union(v.number(), v.null())),
  intervalDays: v.optional(v.union(v.number(), v.null())),
  intervalValue: v.optional(v.union(v.number(), v.null())),
  regulationRef: v.optional(v.union(v.string(), v.null())),
  isRegulatory: v.optional(v.union(v.boolean(), v.null())),
  lastPerformedAt: v.optional(v.union(v.string(), v.null())),
  lastPerformedSource: v.optional(v.union(v.string(), v.null())),
  documentExcerpt: v.optional(v.union(v.string(), v.null())),
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
      const normalizedItem = {
        ...item,
        sourceDocumentName: item.sourceDocumentName ?? undefined,
        description: item.description ?? undefined,
        category: item.category ?? undefined,
        intervalMonths: item.intervalMonths ?? undefined,
        intervalDays: item.intervalDays ?? undefined,
        intervalValue: item.intervalValue ?? undefined,
        regulationRef: item.regulationRef ?? undefined,
        isRegulatory: item.isRegulatory ?? undefined,
        lastPerformedAt: item.lastPerformedAt ?? undefined,
        lastPerformedSource: item.lastPerformedSource ?? undefined,
        documentExcerpt: item.documentExcerpt ?? undefined,
      };
      const id = await ctx.db.insert("inspectionScheduleItems", {
        projectId: args.projectId,
        userId,
        ...normalizedItem,
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

/** Remove multiple items. */
export const removeItems = mutation({
  args: { itemIds: v.array(v.id("inspectionScheduleItems")) },
  handler: async (ctx, args) => {
    if (args.itemIds.length === 0) return;
    let projectId: Id<"projects"> | null = null;
    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      // Skip items that no longer exist (stale UI reference)
      if (!item) continue;
      await requireProjectOwner(ctx, item.projectId);
      projectId = item.projectId;
      await ctx.db.delete(itemId);
    }
    if (projectId) {
      const now = new Date().toISOString();
      await ctx.db.patch(projectId, { updatedAt: now });
    }
  },
});

/** One-time cleanup for legacy rows with null/invalid optional values. */
export const normalizeProjectItems = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const items = await ctx.db
      .query("inspectionScheduleItems")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    let updated = 0;
    const now = new Date().toISOString();

    for (const item of items) {
      const patch: Record<string, unknown> = {};

      if (item.sourceDocumentName === null) patch.sourceDocumentName = undefined;
      if (item.description === null) patch.description = undefined;
      if (item.category === null) patch.category = undefined;
      if (item.regulationRef === null) patch.regulationRef = undefined;
      if (item.lastPerformedAt === null) patch.lastPerformedAt = undefined;
      if (item.lastPerformedSource === null) patch.lastPerformedSource = undefined;
      if (item.documentExcerpt === null) patch.documentExcerpt = undefined;
      if (item.intervalMonths === null) patch.intervalMonths = undefined;
      if (item.intervalDays === null) patch.intervalDays = undefined;
      if (item.intervalValue === null) patch.intervalValue = undefined;
      if (item.isRegulatory === null) patch.isRegulatory = undefined;

      if (
        item.intervalMonths !== undefined &&
        item.intervalMonths !== null &&
        !Number.isFinite(item.intervalMonths)
      ) {
        patch.intervalMonths = undefined;
      }
      if (
        item.intervalDays !== undefined &&
        item.intervalDays !== null &&
        !Number.isFinite(item.intervalDays)
      ) {
        patch.intervalDays = undefined;
      }
      if (
        item.intervalValue !== undefined &&
        item.intervalValue !== null &&
        !Number.isFinite(item.intervalValue)
      ) {
        patch.intervalValue = undefined;
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(item._id, patch);
        updated += 1;
      }
    }

    if (updated > 0) {
      await ctx.db.patch(args.projectId, { updatedAt: now });
    }

    return { scanned: items.length, updated };
  },
});
