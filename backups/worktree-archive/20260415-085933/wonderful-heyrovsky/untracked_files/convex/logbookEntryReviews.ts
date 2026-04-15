/**
 * Convex API for the Entry Review history layer.
 *
 * Reviews are scoped to the Clerk user (identity.subject), NOT a project.
 * Entry Review is a project-less quick-check tool — projectId and aircraftId
 * are optional and only set when the user linked them at review time.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireLogbookEnabled } from "./_helpers";

/**
 * List the current user's review history, newest first. Use `limit` to cap
 * the result size (default 50 is enough for the inline History panel).
 */
export const listForUser = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireAuth(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = await ctx.db
      .query("logbookEntryReviews")
      .withIndex("by_user_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows;
  },
});

export const getById = query({
  args: { reviewId: v.id("logbookEntryReviews") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireAuth(ctx);
    const row = await ctx.db.get(args.reviewId);
    if (!row) return null;
    if (row.userId !== userId) throw new Error("Not authorized");
    return row;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    sourceKind: v.string(), // "paste" | "upload" | "image" | "capture"
    sourceFileName: v.optional(v.string()),
    rawText: v.string(),
    parsedEntries: v.optional(v.any()),
    reviewResults: v.any(),
    engineFindings: v.optional(v.any()),
    operatorType: v.optional(v.string()),
    framework: v.string(), // "FAA" | "EASA"
    mode: v.string(), // "quick" | "structured"
    projectId: v.optional(v.id("projects")),
    aircraftId: v.optional(v.id("aircraftAssets")),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireAuth(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("logbookEntryReviews", {
      userId,
      projectId: args.projectId,
      aircraftId: args.aircraftId,
      title: args.title.trim() || "Untitled review",
      sourceKind: args.sourceKind,
      sourceFileName: args.sourceFileName,
      rawText: args.rawText,
      parsedEntries: args.parsedEntries,
      reviewResults: args.reviewResults,
      engineFindings: args.engineFindings,
      operatorType: args.operatorType,
      framework: args.framework,
      mode: args.mode,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    reviewId: v.id("logbookEntryReviews"),
    title: v.optional(v.string()),
    parsedEntries: v.optional(v.any()),
    reviewResults: v.optional(v.any()),
    engineFindings: v.optional(v.any()),
    operatorType: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    aircraftId: v.optional(v.id("aircraftAssets")),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireAuth(ctx);
    const existing = await ctx.db.get(args.reviewId);
    if (!existing) throw new Error("Review not found");
    if (existing.userId !== userId) throw new Error("Not authorized");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim() || "Untitled review";
    if (args.parsedEntries !== undefined) patch.parsedEntries = args.parsedEntries;
    if (args.reviewResults !== undefined) patch.reviewResults = args.reviewResults;
    if (args.engineFindings !== undefined) patch.engineFindings = args.engineFindings;
    if (args.operatorType !== undefined) patch.operatorType = args.operatorType;
    if (args.projectId !== undefined) patch.projectId = args.projectId;
    if (args.aircraftId !== undefined) patch.aircraftId = args.aircraftId;

    await ctx.db.patch(args.reviewId, patch);
    return args.reviewId;
  },
});

export const remove = mutation({
  args: { reviewId: v.id("logbookEntryReviews") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireAuth(ctx);
    const existing = await ctx.db.get(args.reviewId);
    if (!existing) return null;
    if (existing.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(args.reviewId);
    return args.reviewId;
  },
});
