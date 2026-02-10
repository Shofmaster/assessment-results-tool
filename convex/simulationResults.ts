import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("simulationResults")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    originalId: v.string(),
    name: v.string(),
    assessmentId: v.string(),
    assessmentName: v.string(),
    agentIds: v.array(v.string()),
    totalRounds: v.number(),
    messages: v.any(),
    createdAt: v.string(),
    thinkingEnabled: v.boolean(),
    selfReviewMode: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("simulationResults", {
      projectId: args.projectId,
      userId,
      originalId: args.originalId,
      name: args.name,
      assessmentId: args.assessmentId,
      assessmentName: args.assessmentName,
      agentIds: args.agentIds,
      totalRounds: args.totalRounds,
      messages: args.messages,
      createdAt: args.createdAt,
      thinkingEnabled: args.thinkingEnabled,
      selfReviewMode: args.selfReviewMode,
    });
  },
});

export const remove = mutation({
  args: { simulationId: v.id("simulationResults") },
  handler: async (ctx, args) => {
    const sim = await ctx.db.get(args.simulationId);
    if (!sim) throw new Error("Simulation not found");
    await requireProjectOwner(ctx, sim.projectId);
    await ctx.db.delete(args.simulationId);
    await ctx.db.patch(sim.projectId, { updatedAt: new Date().toISOString() });
  },
});
