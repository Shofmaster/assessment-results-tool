import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner, requireCompanyRole } from "./_helpers";

const ratingTypeValidator = v.union(
  v.literal("airframe"),
  v.literal("powerplant"),
  v.literal("propeller"),
  v.literal("radio"),
  v.literal("instrument"),
  v.literal("accessory"),
  v.literal("limited"),
);

// ── Queries ──────────────────────────────────────────────────────────────────

export const listByEntityProfile = query({
  args: { entityProfileId: v.id("entityProfiles") },
  handler: async (ctx, { entityProfileId }) => {
    return await ctx.db
      .query("entityLimitedRatings" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", entityProfileId))
      .collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (!profile) return [];
    return await ctx.db
      .query("entityLimitedRatings" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
  },
});

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyRole(ctx, companyId, ["company_user"]);
    return await ctx.db
      .query("entityLimitedRatings" as any)
      .withIndex("by_companyId" as any, (q: any) => q.eq("companyId", companyId))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const add = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    articleDescription: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    ratingType: ratingTypeValidator,
    authorizedFunctions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const now = new Date().toISOString();
    const id = await ctx.db.insert("entityLimitedRatings" as any, {
      entityProfileId: args.entityProfileId,
      projectId: args.projectId,
      companyId: args.companyId,
      articleDescription: args.articleDescription,
      make: args.make,
      model: args.model,
      ratingType: args.ratingType,
      authorizedFunctions: args.authorizedFunctions,
      createdAt: now,
      updatedAt: now,
    } as any);

    // Mark the entity profile as having limited ratings
    await ctx.db.patch(args.entityProfileId, { hasLimitedRatings: true } as any);
    await invalidateApplicabilityCache(ctx, args.entityProfileId);
    return id;
  },
});

export const update = mutation({
  args: {
    ratingId: v.id("entityLimitedRatings" as any),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    articleDescription: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    ratingType: v.optional(ratingTypeValidator),
    authorizedFunctions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const row = await ctx.db.get(args.ratingId as any);
    if (!row) throw new Error("Limited rating not found");

    const now = new Date().toISOString();
    await ctx.db.patch(args.ratingId as any, {
      ...(args.articleDescription !== undefined && { articleDescription: args.articleDescription }),
      ...(args.make !== undefined && { make: args.make }),
      ...(args.model !== undefined && { model: args.model }),
      ...(args.ratingType !== undefined && { ratingType: args.ratingType }),
      ...(args.authorizedFunctions !== undefined && { authorizedFunctions: args.authorizedFunctions }),
      updatedAt: now,
    } as any);
    await invalidateApplicabilityCache(ctx, (row as any).entityProfileId);
  },
});

export const remove = mutation({
  args: {
    ratingId: v.id("entityLimitedRatings" as any),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const row = await ctx.db.get(args.ratingId as any);
    if (!row) return;
    await ctx.db.delete(args.ratingId as any);

    // If no more limited ratings, clear the flag
    const remaining = await ctx.db
      .query("entityLimitedRatings" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", (row as any).entityProfileId))
      .first();
    if (!remaining) {
      await ctx.db.patch((row as any).entityProfileId, { hasLimitedRatings: false } as any);
    }
    await invalidateApplicabilityCache(ctx, (row as any).entityProfileId);
  },
});

async function invalidateApplicabilityCache(ctx: any, entityProfileId: string) {
  const cached = await ctx.db
    .query("dctApplicabilityProfiles")
    .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", entityProfileId))
    .first();
  if (cached) await ctx.db.delete(cached._id);
}
