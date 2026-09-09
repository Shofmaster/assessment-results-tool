import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAuth, optionalAuth } from "./_helpers";
import { maskAvianisSecrets } from "./lib/maskSecrets";

// These fields are live, usable credentials (a long-lived API key, an OAuth
// client secret, an account password, and a currently-valid bearer token),
// and every one of them is resolved server-side only, via
// internal.avianisIntegration._getSettingsForUser -- no client code reads
// them off this document. googleClientId/googleApiKey and
// avianisClientId/avianisUsername are deliberately NOT masked: the Google
// values are read client-side (src/utils/googleConfig.ts) to drive the
// Drive Picker/GIS flow in the browser, and a client ID / username are
// identifiers meant to pair with a secret, not secrets themselves -- masking
// them would just make the Settings form forget what the user typed.

// Called from AuthGate, which renders before sign-in, so a signed-out caller is
// expected rather than exceptional -- return null instead of throwing. Same shape as
// users.getCurrent, which is called from the same place.
//
// SECURITY: this used to return the full userSettings row, including
// avianisApiKey/avianisClientSecret/avianisPassword/avianisCachedToken in
// plaintext -- every one of those is only ever needed server-side (see
// avianisIntegration.ts's _getSettingsForUser internalQuery). Masked here
// the same way aiCredentials.ts masks AI provider keys: a "configured" flag
// plus the last 4 characters, never the raw value.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await optionalAuth(ctx);
    if (!userId) return null;
    const doc = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return maskAvianisSecrets(doc);
  },
});

// SECURITY: previously returned every user's row -- including Avianis
// secrets -- in plaintext to any platform-wide admin (requireAdmin checks a
// global role, not per-company). Masked for the same reason as `get` above.
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    try {
      const docs = await ctx.db.query("userSettings").collect();
      return docs.map((doc) => maskAvianisSecrets(doc));
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
    adaptiveThinking: v.optional(v.boolean()),
    adaptiveThinkingEffort: v.optional(v.string()),
    selfReviewMode: v.optional(v.string()),
    selfReviewMaxIterations: v.optional(v.number()),
    activeProjectId: v.optional(v.union(v.id("projects"), v.null())),
    activeCompanyId: v.optional(v.union(v.id("companies"), v.null())),
    googleClientId: v.optional(v.string()),
    googleApiKey: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    claudeModel: v.optional(v.string()),
    auditSimModel: v.optional(v.string()),
    paperworkReviewModel: v.optional(v.string()),
    paperworkReviewAgentId: v.optional(v.string()),
    dctTraceabilityModel: v.optional(v.string()),
    dctTraceabilityAgentId: v.optional(v.string()),
    dctDocumentCheckModel: v.optional(v.string()),
    dctDocumentCheckAgentId: v.optional(v.string()),
    forceCompanyContextDefault: v.optional(v.boolean()),
    avianisAuthMethod: v.optional(v.string()),
    avianisBaseUrl: v.optional(v.string()),
    avianisTenantId: v.optional(v.string()),
    avianisApiKey: v.optional(v.string()),
    avianisClientId: v.optional(v.string()),
    avianisClientSecret: v.optional(v.string()),
    avianisUsername: v.optional(v.string()),
    avianisPassword: v.optional(v.string()),
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
      if ((key === "activeProjectId" || key === "activeCompanyId") && val === null) {
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
      activeProjectId: args.activeProjectId === null ? undefined : args.activeProjectId ?? undefined,
      activeCompanyId: args.activeCompanyId === null ? undefined : args.activeCompanyId ?? undefined,
      googleClientId: args.googleClientId,
      googleApiKey: args.googleApiKey,
      llmProvider: args.llmProvider,
      llmModel: args.llmModel,
      claudeModel: args.claudeModel,
      auditSimModel: args.auditSimModel,
      paperworkReviewModel: args.paperworkReviewModel,
      paperworkReviewAgentId: args.paperworkReviewAgentId,
      dctTraceabilityModel: args.dctTraceabilityModel,
      dctTraceabilityAgentId: args.dctTraceabilityAgentId,
      dctDocumentCheckModel: args.dctDocumentCheckModel,
      dctDocumentCheckAgentId: args.dctDocumentCheckAgentId,
      forceCompanyContextDefault: args.forceCompanyContextDefault ?? false,
      avianisAuthMethod: args.avianisAuthMethod,
      avianisBaseUrl: args.avianisBaseUrl,
      avianisTenantId: args.avianisTenantId,
      avianisApiKey: args.avianisApiKey,
      avianisClientId: args.avianisClientId,
      avianisClientSecret: args.avianisClientSecret,
      avianisUsername: args.avianisUsername,
      avianisPassword: args.avianisPassword,
    });
  },
});

export const updateEnabledAgents = mutation({
  args: {
    targetUserId: v.id("users"),
    enabledAgents: v.union(v.array(v.string()), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) throw new Error("Target user not found");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", targetUser.clerkUserId))
      .unique();

    const value = args.enabledAgents ?? undefined;

    if (existing) {
      await ctx.db.patch(existing._id, { enabledAgents: value });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId: targetUser.clerkUserId,
      thinkingEnabled: false,
      thinkingBudget: 10000,
      selfReviewMode: "off",
      selfReviewMaxIterations: 2,
      enabledAgents: value,
    });
  },
});

export const updateEnabledFrameworks = mutation({
  args: {
    targetUserId: v.id("users"),
    enabledFrameworks: v.union(v.array(v.string()), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) throw new Error("Target user not found");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", targetUser.clerkUserId))
      .unique();

    const value = args.enabledFrameworks ?? undefined;

    if (existing) {
      await ctx.db.patch(existing._id, { enabledFrameworks: value });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId: targetUser.clerkUserId,
      thinkingEnabled: false,
      thinkingBudget: 10000,
      selfReviewMode: "off",
      selfReviewMaxIterations: 2,
      enabledFrameworks: value,
    });
  },
});

export const updateEnabledFeatures = mutation({
  args: {
    targetUserId: v.id("users"),
    enabledFeatures: v.union(v.array(v.string()), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) throw new Error("Target user not found");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", targetUser.clerkUserId))
      .unique();

    const value = args.enabledFeatures ?? undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabledFeatures: value,
        entitlementSource: "manual",
      });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId: targetUser.clerkUserId,
      thinkingEnabled: false,
      thinkingBudget: 10000,
      selfReviewMode: "off",
      selfReviewMaxIterations: 2,
      enabledFeatures: value,
      entitlementSource: "manual",
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
        entitlementSource: "manual",
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
      entitlementSource: "manual",
    });
  },
});
