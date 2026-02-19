import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 50;

/** List reviews (paginated). Use get(id) when you only need one. */
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("documentReviews")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

/** Full review including findings. Use when viewing/editing a review. */
export const get = query({
  args: { reviewId: v.id("documentReviews") },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) return null;
    await requireProjectOwner(ctx, review.projectId);
    return review;
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
    underReviewDocumentId: v.id("documents"),
    name: v.optional(v.string()),
    status: v.string(),
    verdict: v.optional(v.string()),
    findings: v.optional(v.any()),
    reviewScope: v.optional(v.string()),
    notes: v.optional(v.string()),
    referenceDocumentIds: v.optional(v.array(v.id("documents"))),
    sharedReferenceDocumentIds: v.optional(v.array(v.id("sharedReferenceDocuments"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("documentReviews", {
      projectId: args.projectId,
      userId,
      underReviewDocumentId: args.underReviewDocumentId,
      name: args.name,
      status: args.status,
      verdict: args.verdict,
      findings: args.findings ?? [],
      reviewScope: args.reviewScope,
      notes: args.notes,
      referenceDocumentIds: args.referenceDocumentIds,
      sharedReferenceDocumentIds: args.sharedReferenceDocumentIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    reviewId: v.id("documentReviews"),
    verdict: v.optional(v.string()),
    findings: v.optional(v.any()),
    reviewScope: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { reviewId, ...updates } = args;
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error("Review not found");
    await requireProjectOwner(ctx, review.projectId);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(reviewId, {
      ...filtered,
      updatedAt: new Date().toISOString(),
    });
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
  },
});
