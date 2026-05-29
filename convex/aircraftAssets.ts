import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireLogbookEnabled, requireProjectAccess } from "./_helpers";

async function assertAircraftTypeInProject(
  ctx: { db: any },
  aircraftTypeId: Id<"aircraftTypes"> | undefined,
  projectId: Id<"projects">,
) {
  if (!aircraftTypeId) return;
  const typeRow = await ctx.db.get(aircraftTypeId);
  if (!typeRow || typeRow.projectId !== projectId) {
    throw new Error("Aircraft type must belong to the same project");
  }
}

async function listAssetsForProject(ctx: { db: any }, projectId: Id<"projects">) {
  return ctx.db
    .query("aircraftAssets")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .collect();
}

/** List aircraft for Library linking/filtering (no logbook entitlement required). */
export const listByProjectForLibrary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    try {
      await requireProjectAccess(ctx, args.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Project not found" || message === "Not authorized: not the project owner") {
        return [];
      }
      throw error;
    }
    return listAssetsForProject(ctx, args.projectId);
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    try {
      await requireProjectAccess(ctx, args.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Avoid hard-crashing the Logbook page when a previously selected project
      // was deleted or the user no longer has access.
      if (message === "Project not found" || message === "Not authorized: not the project owner") {
        return [];
      }
      throw error;
    }
    return listAssetsForProject(ctx, args.projectId);
  },
});

export const get = query({
  args: { aircraftId: v.id("aircraftAssets") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const asset = await ctx.db.get(args.aircraftId);
    if (!asset) return null;
    await requireProjectAccess(ctx, asset.projectId);
    return asset;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftTypeId: v.optional(v.id("aircraftTypes")),
    tailNumber: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    serial: v.optional(v.string()),
    operator: v.optional(v.string()),
    year: v.optional(v.number()),
    baselineTotalTime: v.optional(v.number()),
    baselineTotalCycles: v.optional(v.number()),
    baselineTotalLandings: v.optional(v.number()),
    baselineAsOfDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireProjectAccess(ctx, args.projectId);
    await assertAircraftTypeInProject(ctx, args.aircraftTypeId, args.projectId);
    const now = new Date().toISOString();
    const id = await ctx.db.insert("aircraftAssets", {
      ...args,
      userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return id;
  },
});

export const update = mutation({
  args: {
    aircraftId: v.id("aircraftAssets"),
    aircraftTypeId: v.optional(v.union(v.id("aircraftTypes"), v.null())),
    tailNumber: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    serial: v.optional(v.string()),
    operator: v.optional(v.string()),
    year: v.optional(v.number()),
    baselineTotalTime: v.optional(v.number()),
    baselineTotalCycles: v.optional(v.number()),
    baselineTotalLandings: v.optional(v.number()),
    baselineAsOfDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const asset = await ctx.db.get(args.aircraftId);
    if (!asset) throw new Error("Aircraft not found");
    await requireProjectAccess(ctx, asset.projectId);
    const { aircraftId, ...updates } = args;
    if (updates.aircraftTypeId !== undefined) {
      if (updates.aircraftTypeId === null) {
        updates.aircraftTypeId = undefined;
      } else {
        await assertAircraftTypeInProject(ctx, updates.aircraftTypeId, asset.projectId);
      }
    }
    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) patch[key] = val;
    }
    if (Object.keys(patch).length === 0) return aircraftId;
    const now = new Date().toISOString();
    patch.updatedAt = now;
    await ctx.db.patch(aircraftId, patch);
    await ctx.db.patch(asset.projectId, { updatedAt: now });
    return aircraftId;
  },
});

export const remove = mutation({
  args: { aircraftId: v.id("aircraftAssets") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const asset = await ctx.db.get(args.aircraftId);
    if (!asset) throw new Error("Aircraft not found");
    await requireProjectAccess(ctx, asset.projectId);
    await ctx.db.delete(args.aircraftId);
    await ctx.db.patch(asset.projectId, { updatedAt: new Date().toISOString() });
  },
});
