import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("assessments")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    originalId: v.string(),
    data: v.any(),
    importedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("assessments", {
      projectId: args.projectId,
      userId,
      originalId: args.originalId,
      data: args.data,
      importedAt: args.importedAt,
    });
  },
});

export const remove = mutation({
  args: { assessmentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) throw new Error("Assessment not found");
    await requireProjectOwner(ctx, assessment.projectId);
    await ctx.db.delete(args.assessmentId);
    await ctx.db.patch(assessment.projectId, { updatedAt: new Date().toISOString() });
  },
});
