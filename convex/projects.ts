import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireProjectOwner } from "./_helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      userId,
      name: args.name,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.projectId, updates);
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);

    // Cascade delete all child records
    const tables = [
      "assessments",
      "documents",
      "analyses",
      "simulationResults",
      "documentRevisions",
      "projectAgentDocuments",
    ] as const;

    for (const table of tables) {
      const records = await ctx.db
        .query(table)
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .collect();
      for (const record of records) {
        // Delete associated storage files
        if ("storageId" in record && record.storageId) {
          await ctx.storage.delete(record.storageId as any);
        }
        await ctx.db.delete(record._id);
      }
    }

    await ctx.db.delete(args.projectId);
  },
});
