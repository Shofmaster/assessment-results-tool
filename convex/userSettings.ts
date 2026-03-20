import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAuth } from "./_helpers";

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

export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    try {
      return await ctx.db.query("userSettings").collect();
    } catch (error) {
      console.error("userSettings.listAllForAdmin failed", error);
      return [];
    }
  },
});

export const upsert = mutation({
  args: {
    thinkingEnabled: v.optional(v.boolean()),
    thinkingBudget: v.optional(v.number()),
    selfReviewMode: v.optional(v.string()),
    selfReviewMaxIterations: v.optional(v.number()),
    activeProjectId: v.optional(v.union(v.id("projects"), v.null())),
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

    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(args)) {
      if (val === undefined) continue;
      if (key === "activeProjectId" && val === null) {
        updates[key] = undefined;
      } else {
        updates[key] = val;
      }
    }

    if (existing) {
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existing._id, updates);
      }
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId,
      thinkingEnabled: args.thinkingEnabled ?? false,
      thinkingBudget: args.thinkingBudget ?? 10000,
      selfReviewMode: args.selfReviewMode ?? "off",
      selfReviewMaxIterations: args.selfReviewMaxIterations ?? 2,
      activeProjectId: args.activeProjectId ?? undefined,
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

export const setLogbookEntitlement = mutation({
  args: {
    targetUserId: v.id("users"),
    logbookEnabled: v.boolean(),
    logbookEntitlementMode: v.optional(v.union(v.literal("addon"), v.literal("standalone"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", targetUser.clerkUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        logbookEnabled: args.logbookEnabled,
        logbookEntitlementMode: args.logbookEnabled ? args.logbookEntitlementMode : undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId: targetUser.clerkUserId,
      thinkingEnabled: false,
      thinkingBudget: 10000,
      selfReviewMode: "off",
      selfReviewMaxIterations: 2,
      logbookEnabled: args.logbookEnabled,
      logbookEntitlementMode: args.logbookEnabled ? args.logbookEntitlementMode : undefined,
    });
  },
});
