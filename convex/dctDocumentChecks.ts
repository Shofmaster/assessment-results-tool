import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 50;

export const listByProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const take = Math.max(1, Math.min(args.limit ?? LIST_PAGE_SIZE, 200));
    return await ctx.db
      .query("dctDocumentChecks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(take);
  },
});

export const get = query({
  args: { checkId: v.id("dctDocumentChecks") },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    await requireProjectOwner(ctx, check.projectId);
    return check;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    verdict: v.optional(
      v.union(v.literal("pass"), v.literal("conditional"), v.literal("fail"), v.literal("pending")),
    ),
    scope: v.optional(v.string()),
    notes: v.optional(v.string()),
    perspectiveAgentId: v.optional(v.string()),
    model: v.optional(v.string()),
    totals: v.optional(
      v.object({
        questions: v.number(),
        critical: v.number(),
        major: v.number(),
        minor: v.number(),
        observation: v.number(),
        aligned: v.number(),
        gap: v.number(),
        mismatch: v.number(),
        pending: v.number(),
      }),
    ),
    findings: v.optional(v.any()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("dctDocumentChecks", {
      projectId: args.projectId,
      userId,
      status: args.status,
      verdict: args.verdict,
      scope: args.scope,
      notes: args.notes,
      perspectiveAgentId: args.perspectiveAgentId,
      model: args.model,
      totals: args.totals,
      findings: args.findings ?? [],
      startedAt: args.startedAt ?? now,
      completedAt: args.completedAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    checkId: v.id("dctDocumentChecks"),
    status: v.optional(v.union(v.literal("running"), v.literal("completed"), v.literal("failed"))),
    verdict: v.optional(
      v.union(v.literal("pass"), v.literal("conditional"), v.literal("fail"), v.literal("pending")),
    ),
    scope: v.optional(v.string()),
    notes: v.optional(v.string()),
    perspectiveAgentId: v.optional(v.string()),
    model: v.optional(v.string()),
    totals: v.optional(
      v.object({
        questions: v.number(),
        critical: v.number(),
        major: v.number(),
        minor: v.number(),
        observation: v.number(),
        aligned: v.number(),
        gap: v.number(),
        mismatch: v.number(),
        pending: v.number(),
      }),
    ),
    findings: v.optional(v.any()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) throw new Error("DCT document check not found");
    await requireProjectOwner(ctx, check.projectId);
    const { checkId, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, val]) => val !== undefined));
    await ctx.db.patch(checkId, {
      ...filtered,
      updatedAt: new Date().toISOString(),
    });
    return checkId;
  },
});

export const remove = mutation({
  args: { checkId: v.id("dctDocumentChecks") },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) throw new Error("DCT document check not found");
    await requireProjectOwner(ctx, check.projectId);
    await ctx.db.delete(args.checkId);
  },
});
