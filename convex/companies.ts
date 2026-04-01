import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAdmin,
  requireAerogapEmployee,
  requireAuth,
  requireCompanyOrDelegatedSupportAccess,
  requireCompanyRole,
  requireProjectAccess,
} from "./_helpers";

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("companies").collect();
  },
});

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .first();

    if (user?.role === "admin" || user?.role === "aerogap_employee") {
      return await ctx.db.query("companies").collect();
    }

    const [memberships, supportAssignments] = await Promise.all([
      ctx.db.query("companyMemberships").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db
        .query("companySupportAssignments")
        .withIndex("by_supportUserId", (q) => q.eq("supportUserId", userId))
        .collect(),
    ]);
    const companyIds = new Set<string>();
    memberships
      .filter((m) => m.status !== "suspended")
      .forEach((m) => companyIds.add(m.companyId));
    supportAssignments
      .filter((a) => a.isActive)
      .forEach((a) => companyIds.add(a.companyId));

    const companies = await Promise.all(Array.from(companyIds).map((id) => ctx.db.get(id as any)));
    return companies.filter(Boolean);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    initialAdminUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireAerogapEmployee(ctx);
    const now = new Date().toISOString();
    const slug = normalizeSlug(args.slug || args.name);
    const companyId = await ctx.db.insert("companies", {
      name: args.name.trim(),
      slug,
      isActive: true,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });

    const firstAdminUserId = args.initialAdminUserId ?? actorId;
    await ctx.db.insert("companyMemberships", {
      companyId,
      userId: firstAdminUserId,
      role: "company_admin",
      status: "active",
      addedBy: actorId,
      createdAt: now,
      updatedAt: now,
    });

    return companyId;
  },
});

export const update = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.slug !== undefined) updates.slug = normalizeSlug(args.slug);
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    await ctx.db.patch(args.companyId, updates);
  },
});

export const listMembers = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    return await ctx.db
      .query("companyMemberships")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const addMember = mutation({
  args: {
    companyId: v.id("companies"),
    userId: v.string(), // Clerk userId
    role: v.union(v.literal("company_admin"), v.literal("company_manager"), v.literal("company_user")),
    status: v.optional(v.union(v.literal("active"), v.literal("invited"), v.literal("suspended"))),
  },
  handler: async (ctx, args) => {
    const actorId = await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const existing = await ctx.db
      .query("companyMemberships")
      .withIndex("by_companyId_userId", (q) =>
        q.eq("companyId", args.companyId).eq("userId", args.userId)
      )
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: args.status ?? "active",
        addedBy: actorId,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("companyMemberships", {
      companyId: args.companyId,
      userId: args.userId,
      role: args.role,
      status: args.status ?? "active",
      addedBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeMember = mutation({
  args: {
    companyId: v.id("companies"),
    membershipId: v.id("companyMemberships"),
  },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.companyId !== args.companyId) {
      throw new Error("Membership not found for company");
    }
    await ctx.db.delete(args.membershipId);
  },
});

export const listSupportAssignments = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    return await ctx.db
      .query("companySupportAssignments")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const assignSupportUser = mutation({
  args: {
    companyId: v.id("companies"),
    supportUserId: v.string(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const assignedBy = await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const supportUser = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.supportUserId))
      .first();
    if (!supportUser || (supportUser.role !== "aerogap_employee" && supportUser.role !== "admin")) {
      throw new Error("Support user must be an AeroGap employee or admin");
    }

    const existing = await ctx.db
      .query("companySupportAssignments")
      .withIndex("by_companyId_supportUserId", (q) =>
        q.eq("companyId", args.companyId).eq("supportUserId", args.supportUserId)
      )
      .first();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: args.isActive ?? true,
        assignedBy,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("companySupportAssignments", {
      companyId: args.companyId,
      supportUserId: args.supportUserId,
      assignedBy,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeSupportAssignment = mutation({
  args: {
    companyId: v.id("companies"),
    assignmentId: v.id("companySupportAssignments"),
  },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.companyId !== args.companyId) {
      throw new Error("Support assignment not found");
    }
    await ctx.db.delete(args.assignmentId);
  },
});

export const getFeaturePolicy = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    return await ctx.db
      .query("companyFeaturePolicies")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .unique();
  },
});

export const getFeaturePolicyByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) {
      return null;
    }
    return await ctx.db
      .query("companyFeaturePolicies")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId))
      .unique();
  },
});

export const upsertFeaturePolicy = mutation({
  args: {
    companyId: v.id("companies"),
    enabledAgents: v.optional(v.union(v.array(v.string()), v.null())),
    enabledFrameworks: v.optional(v.union(v.array(v.string()), v.null())),
    enabledFeatures: v.optional(v.union(v.array(v.string()), v.null())),
    logbookEnabled: v.optional(v.boolean()),
    logbookEntitlementMode: v.optional(v.union(v.literal("addon"), v.literal("standalone"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    const existing = await ctx.db
      .query("companyFeaturePolicies")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .unique();
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      updatedAt: now,
    };
    if (args.enabledAgents !== undefined) updates.enabledAgents = args.enabledAgents ?? undefined;
    if (args.enabledFrameworks !== undefined) updates.enabledFrameworks = args.enabledFrameworks ?? undefined;
    if (args.enabledFeatures !== undefined) updates.enabledFeatures = args.enabledFeatures ?? undefined;
    if (args.logbookEnabled !== undefined) updates.logbookEnabled = args.logbookEnabled;
    if (args.logbookEntitlementMode !== undefined) {
      updates.logbookEntitlementMode = args.logbookEntitlementMode ?? undefined;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("companyFeaturePolicies", {
      companyId: args.companyId,
      enabledAgents: args.enabledAgents ?? undefined,
      enabledFrameworks: args.enabledFrameworks ?? undefined,
      enabledFeatures: args.enabledFeatures ?? undefined,
      logbookEnabled: args.logbookEnabled,
      logbookEntitlementMode: args.logbookEntitlementMode ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});
