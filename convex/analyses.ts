import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 50;

/** List analyses without heavy fields (findings, recommendations, compliance, etc.). Use get(id) when viewing one. */
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const rows = await ctx.db
      .query("analyses")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
    return rows.map(({ findings, recommendations, compliance, documentAnalyses, combinedInsights, ...rest }) => rest);
  },
});

/** Full analysis including findings, recommendations, compliance. Use when viewing analysis detail. */
export const get = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    await requireProjectOwner(ctx, analysis.projectId);
    return analysis;
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
