import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireProjectAccess } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = await ctx.db
      .query("aircraftTypes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    rows.sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
    return rows;
  },
});

export const get = query({
  args: { aircraftTypeId: v.id("aircraftTypes") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.aircraftTypeId);
    if (!row) return null;
    await requireProjectAccess(ctx, row.projectId);
    return row;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.optional(v.string()),
    variant: v.optional(v.string()),
    notes: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    const now = new Date().toISOString();
    const id = await ctx.db.insert("aircraftTypes", {
      projectId: args.projectId,
      userId,
      name: args.name.trim(),
      manufacturer: args.manufacturer?.trim() || undefined,
      model: args.model?.trim() || undefined,
      variant: args.variant?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return id;
  },
});

export const update = mutation({
  args: {
    aircraftTypeId: v.id("aircraftTypes"),
    name: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    model: v.optional(v.string()),
    variant: v.optional(v.string()),
    notes: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.aircraftTypeId);
    if (!row) throw new Error("Aircraft type not found");
    await requireProjectAccess(ctx, row.projectId);
    const { aircraftTypeId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name.trim();
    if (updates.manufacturer !== undefined) {
      patch.manufacturer = updates.manufacturer.trim() || undefined;
    }
    if (updates.model !== undefined) patch.model = updates.model.trim() || undefined;
    if (updates.variant !== undefined) patch.variant = updates.variant.trim() || undefined;
    if (updates.notes !== undefined) patch.notes = updates.notes.trim() || undefined;
    if (updates.sortOrder !== undefined) patch.sortOrder = updates.sortOrder;
    if (Object.keys(patch).length === 0) return aircraftTypeId;
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(aircraftTypeId, patch);
    await ctx.db.patch(row.projectId, { updatedAt: patch.updatedAt as string });
    return aircraftTypeId;
  },
});

/** Create types from distinct make/model on existing tails and link publications by makeModel. */
export const backfillFromAssets = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await ctx.runMutation(internal.aircraftTypesBackfill.backfillProject, {
      projectId: args.projectId,
    });
  },
});

export const remove = mutation({
  args: { aircraftTypeId: v.id("aircraftTypes") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.aircraftTypeId);
    if (!row) throw new Error("Aircraft type not found");
    await requireProjectAccess(ctx, row.projectId);

    const assets = await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId_aircraftTypeId", (q) =>
        q.eq("projectId", row.projectId).eq("aircraftTypeId", args.aircraftTypeId),
      )
      .collect();
    const now = new Date().toISOString();
    for (const asset of assets) {
      await ctx.db.patch(asset._id, { aircraftTypeId: undefined, updatedAt: now });
    }

    await ctx.db.delete(args.aircraftTypeId);
    await ctx.db.patch(row.projectId, { updatedAt: now });
  },
});
