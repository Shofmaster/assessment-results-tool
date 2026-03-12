import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./_helpers";

async function isAerogapPrivileged(ctx: any, userId: string): Promise<boolean> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", userId))
    .unique();
  return user?.role === "admin" || user?.role === "aerogap_employee";
}

// List all change log entries for a revision
export const listByRevision = query({
  args: { revisionId: v.id("manualRevisions") },
  handler: async (ctx, { revisionId }) => {
    const userId = await requireAuth(ctx);
    const revision = await ctx.db.get(revisionId);
    if (!revision) return [];
    const manual = await ctx.db.get(revision.manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
    const logs = await ctx.db
      .query("manualChangeLogs")
      .withIndex("by_revisionId", (q: any) => q.eq("revisionId", revisionId))
      .collect();
    // Attach author name for display
    const authorIds = [...new Set(logs.map((l: any) => l.authorId))];
    const authors: Record<string, string> = {};
    for (const authorId of authorIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", authorId))
        .unique();
      authors[authorId] = user?.name || user?.email || authorId;
    }
    return logs.map((l: any) => ({ ...l, authorName: authors[l.authorId] || l.authorId }));
  },
});

// Add a change log entry to a revision
export const add = mutation({
  args: {
    manualId: v.id("manuals"),
    revisionId: v.id("manualRevisions"),
    section: v.string(),
    description: v.string(),
    changeType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(args.manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
    return await ctx.db.insert("manualChangeLogs", {
      manualId: args.manualId,
      revisionId: args.revisionId,
      section: args.section,
      description: args.description,
      changeType: args.changeType,
      authorId: userId,
      createdAt: new Date().toISOString(),
    });
  },
});

// Remove a change log entry
export const remove = mutation({
  args: { logId: v.id("manualChangeLogs") },
  handler: async (ctx, { logId }) => {
    const userId = await requireAuth(ctx);
    const log = await ctx.db.get(logId);
    if (!log) return;
    const manual = await ctx.db.get(log.manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
    await ctx.db.delete(logId);
  },
});
