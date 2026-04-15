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
    name: v.optional(v.string()), // optional label so multiple reviews per document are distinguishable
    referenceDocumentId: v.optional(v.id("documents")),
    sharedReferenceDocumentId: v.optional(v.id("sharedReferenceDocuments")),
    referenceDocumentIds: v.optional(v.array(v.id("documents"))),
    sharedReferenceDocumentIds: v.optional(v.array(v.id("sharedReferenceDocuments"))),
    underReviewDocumentId: v.id("documents"),
    status: v.optional(v.string()),
    findings: v.optional(v.any()),
    reviewScope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projectRefIds = args.referenceDocumentIds ?? (args.referenceDocumentId ? [args.referenceDocumentId] : []);
    const sharedRefIds = args.sharedReferenceDocumentIds ?? (args.sharedReferenceDocumentId ? [args.sharedReferenceDocumentId] : []);
    if (projectRefIds.length === 0 && sharedRefIds.length === 0) {
      throw new Error("At least one reference document is required");
    }
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("documentReviews", {
      projectId: args.projectId,
      userId,
      name: args.name?.trim() || undefined,
      referenceDocumentId: projectRefIds.length > 0 ? projectRefIds[0] : undefined,
      sharedReferenceDocumentId: sharedRefIds.length > 0 ? sharedRefIds[0] : undefined,
      referenceDocumentIds: projectRefIds.length > 0 ? projectRefIds : undefined,
      sharedReferenceDocumentIds: sharedRefIds.length > 0 ? sharedRefIds : undefined,
      underReviewDocumentId: args.underReviewDocumentId,
      status: args.status ?? "draft",
      findings: args.findings ?? [],
      reviewScope: args.reviewScope,
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    reviewId: v.id("documentReviews"),
    name: v.optional(v.string()),
    status: v.optional(v.string()),
    verdict: v.optional(v.string()),
    findings: v.optional(v.any()),
    reviewScope: v.optional(v.string()),
    notes: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { reviewId, ...updates } = args;
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error("Review not found");
    await requireProjectOwner(ctx, review.projectId);
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name?.trim() || undefined;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.verdict !== undefined) patch.verdict = updates.verdict;
    if (updates.findings !== undefined) patch.findings = updates.findings;
    if (updates.reviewScope !== undefined) patch.reviewScope = updates.reviewScope;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.completedAt !== undefined) patch.completedAt = updates.completedAt;
    await ctx.db.patch(reviewId, patch);
    return reviewId;
  },
});

export const remove = mutation({
  args: { reviewId: v.id("documentReviews") },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new Error("Review not found");
    await requireProjectOwner(ctx, review.projectId);
    await ctx.db.delete(args.reviewId);
    return args.reviewId;
  },
});
