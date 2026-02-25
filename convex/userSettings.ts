import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./_helpers";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    thinkingEnabled: v.optional(v.boolean()),
    thinkingBudget: v.optional(v.number()),
    selfReviewMode: v.optional(v.string()),
    selfReviewMaxIterations: v.optional(v.number()),
    activeProjectId: v.optional(v.id("projects")),
    googleClientId: v.optional(v.string()),
    googleApiKey: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    claudeModel: v.optional(v.string()),
    auditSimModel: v.optional(v.string()),
    paperworkReviewModel: v.optional(v.string()),
    paperworkReviewAgentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const updates = Object.fromEntries(
      Object.entries(args).filter(([, val]) => val !== undefined)
    );

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId,
      thinkingEnabled: args.thinkingEnabled ?? false,
      thinkingBudget: args.thinkingBudget ?? 10000,
      selfReviewMode: args.selfReviewMode ?? "off",
      selfReviewMaxIterations: args.selfReviewMaxIterations ?? 2,
      activeProjectId: args.activeProjectId,
      googleClientId: args.googleClientId,
      googleApiKey: args.googleApiKey,
      llmProvider: args.llmProvider,
      llmModel: args.llmModel,
      claudeModel: args.claudeModel,
      auditSimModel: args.auditSimModel,
      paperworkReviewModel: args.paperworkReviewModel,
      paperworkReviewAgentId: args.paperworkReviewAgentId,
    });
  },
});
