import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdmin, requireCompanyRole, requirePlatformStaff } from "./_helpers";

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .first();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    return await ctx.db.query("users").collect();
  },
});

/** Company admins: resolve a user by email (case-insensitive) for adding members. */
export const lookupByEmailForCompanyAdmin = query({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return null;
    const indexed = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (indexed) return indexed;
    const all = await ctx.db.query("users").collect();
    return all.find((u) => (u.email || "").toLowerCase() === normalized) ?? null;
  },
});

/** Tenant company admins: list platform staff for delegated support (matches assignSupport permission). */
export const listPlatformStaffForSupportPicker = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const all = await ctx.db.query("users").collect();
    return all
      .filter((u) => u.role === "admin" || u.role === "aerogap_employee")
      .map((u) => ({
        clerkUserId: u.clerkUserId,
        name: u.name,
        email: u.email,
      }));
  },
});

export const upsertFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    const now = new Date().toISOString();

    const emailNormalized = args.email.trim().toLowerCase();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: emailNormalized,
        name: args.name,
        picture: args.picture,
        lastSignInAt: now,
      });
      return existing._id;
    }

    // Check if this is the first user — make them admin
    const anyUser = await ctx.db.query("users").first();
    const role = anyUser ? "user" : "admin";

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: emailNormalized,
      name: args.name,
      picture: args.picture,
      role,
      createdAt: now,
      lastSignInAt: now,
    });
  },
});

export const setRole = mutation({
  args: {
    targetUserId: v.id("users"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.role !== "user" && args.role !== "admin" && args.role !== "aerogap_employee") {
      throw new Error("Invalid role");
    }
    await ctx.db.patch(args.targetUserId, { role: args.role });
  },
});

// Internal mutation for Clerk webhook
export const upsertFromWebhook = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    const now = new Date().toISOString();

    const emailNormalized = args.email.trim().toLowerCase();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: emailNormalized,
        name: args.name,
        picture: args.picture,
        lastSignInAt: now,
      });
      return;
    }

    const anyUser = await ctx.db.query("users").first();
    const role = anyUser ? "user" : "admin";

    await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: emailNormalized,
      name: args.name,
      picture: args.picture,
      role,
      createdAt: now,
      lastSignInAt: now,
    });
  },
});
