import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("documentRevisions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const set = mutation({
  args: {
    projectId: v.id("projects"),
    revisions: v.array(
      v.object({
        originalId: v.string(),
        documentName: v.string(),
        documentType: v.string(),
        sourceDocumentId: v.string(),
        category: v.optional(v.string()),
        detectedRevision: v.string(),
        latestKnownRevision: v.string(),
        isCurrentRevision: v.optional(v.boolean()),
        lastCheckedAt: v.optional(v.string()),
        searchSummary: v.string(),
        status: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);

    // Delete existing revisions
    const existing = await ctx.db
      .query("documentRevisions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const rev of existing) {
      await ctx.db.delete(rev._id);
    }

    // Insert new
    for (const rev of args.revisions) {
      await ctx.db.insert("documentRevisions", {
        projectId: args.projectId,
        userId,
        ...rev,
      });
    }

    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const update = mutation({
  args: {
    revisionId: v.id("documentRevisions"),
    latestKnownRevision: v.optional(v.string()),
    isCurrentRevision: v.optional(v.boolean()),
    lastCheckedAt: v.optional(v.string()),
    searchSummary: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rev = await ctx.db.get(args.revisionId);
    if (!rev) throw new Error("Revision not found");
    await requireProjectOwner(ctx, rev.projectId);

    const { revisionId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(args.revisionId, filtered);
  },
});
