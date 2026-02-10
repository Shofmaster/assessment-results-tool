import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("analyses")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.string(),
    companyName: v.string(),
    analysisDate: v.string(),
    findings: v.any(),
    recommendations: v.any(),
    compliance: v.any(),
    documentAnalyses: v.optional(v.any()),
    combinedInsights: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("analyses", {
      projectId: args.projectId,
      userId,
      assessmentId: args.assessmentId,
      companyName: args.companyName,
      analysisDate: args.analysisDate,
      findings: args.findings,
      recommendations: args.recommendations,
      compliance: args.compliance,
      documentAnalyses: args.documentAnalyses,
      combinedInsights: args.combinedInsights,
    });
  },
});
