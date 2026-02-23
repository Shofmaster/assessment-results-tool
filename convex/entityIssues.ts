import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 200;

const sourceValidator = v.union(
  v.literal("audit_sim"),
  v.literal("paperwork_review"),
  v.literal("analysis"),
  v.literal("manual")
);
const severityValidator = v.union(
  v.literal("critical"),
  v.literal("major"),
  v.literal("minor"),
  v.literal("observation")
);

/** List entity issues for a project. Optionally filter by assessment. */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    if (args.assessmentId) {
      return await ctx.db
        .query("entityIssues")
        .withIndex("by_projectId_assessment", (q) =>
          q.eq("projectId", args.projectId).eq("assessmentId", args.assessmentId!)
        )
        .take(LIST_PAGE_SIZE);
    }
    return await ctx.db
      .query("entityIssues")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.optional(v.string()),
    source: sourceValidator,
    sourceId: v.optional(v.string()),
    severity: severityValidator,
    title: v.string(),
    description: v.string(),
    regulationRef: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("entityIssues", {
      projectId: args.projectId,
      userId,
      assessmentId: args.assessmentId,
      source: args.source,
      sourceId: args.sourceId,
      severity: args.severity,
      title: args.title,
      description: args.description,
      regulationRef: args.regulationRef,
      location: args.location,
      createdAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    issueId: v.id("entityIssues"),
    severity: v.optional(severityValidator),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    regulationRef: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Entity issue not found");
    await requireProjectOwner(ctx, issue.projectId);
    const { issueId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.severity !== undefined) patch.severity = updates.severity;
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.regulationRef !== undefined) patch.regulationRef = updates.regulationRef;
    if (updates.location !== undefined) patch.location = updates.location;
    if (Object.keys(patch).length === 0) return issueId;
    await ctx.db.patch(issueId, patch);
    await ctx.db.patch(issue.projectId, { updatedAt: new Date().toISOString() });
    return issueId;
  },
});

export const remove = mutation({
  args: { issueId: v.id("entityIssues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Entity issue not found");
    await requireProjectOwner(ctx, issue.projectId);
    await ctx.db.delete(args.issueId);
    await ctx.db.patch(issue.projectId, { updatedAt: new Date().toISOString() });
  },
});
