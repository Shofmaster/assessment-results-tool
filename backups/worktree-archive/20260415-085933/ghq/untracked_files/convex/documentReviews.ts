import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("documentReviews")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listByProjectAndUnderReview = query({
  args: {
    projectId: v.id("projects"),
    underReviewDocumentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("documentReviews")
      .withIndex("by_projectId_underReview", (q) =>
        q.eq("projectId", args.projectId).eq("underReviewDocumentId", args.underReviewDocumentId)
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    referenceDocumentId: v.id("documents"),
    underReviewDocumentId: v.id("documents"),
    status: v.optional(v.string()),
    findings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("documentReviews", {
      projectId: args.projectId,
      userId,
      referenceDocumentId: args.referenceDocumentId,
      underReviewDocumentId: args.underReviewDocumentId,
      status: args.status ?? "draft",
      findings: args.findings ?? [],
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    reviewId: v.id("documentReviews"),
    status: v.optional(v.string()),
    verdict: v.optional(v.string()),
    findings: v.optional(v.any()),
    notes: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { reviewId, ...updates } = args;
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error("Review not found");
    await requireProjectOwner(ctx, review.projectId);
    const patch: Record<string, unknown> = {};
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.verdict !== undefined) patch.verdict = updates.verdict;
    if (updates.findings !== undefined) patch.findings = updates.findings;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.completedAt !== undefined) patch.completedAt = updates.completedAt;
    await ctx.db.patch(reviewId, patch);
    return reviewId;
  },
});
