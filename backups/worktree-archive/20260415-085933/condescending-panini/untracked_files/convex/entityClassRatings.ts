import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner, requireCompanyRole } from "./_helpers";

const categoryValidator = v.union(
  v.literal("airframe"),
  v.literal("powerplant"),
  v.literal("propeller"),
  v.literal("radio"),
  v.literal("instrument"),
  v.literal("accessory"),
);

const classNumberValidator = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
);

/** Resolve entityProfileId for the given project or company. */
async function resolveEntityProfileId(
  ctx: any,
  args: { projectId?: string; companyId?: string }
) {
  if (args.companyId) {
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", args.companyId))
      .first();
    return profile?._id ?? null;
  }
  if (args.projectId) {
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", args.projectId))
      .first();
    return profile?._id ?? null;
  }
  return null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const listByEntityProfile = query({
  args: { entityProfileId: v.id("entityProfiles") },
  handler: async (ctx, { entityProfileId }) => {
    return await ctx.db
      .query("entityClassRatings" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", entityProfileId))
      .collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const profileId = await resolveEntityProfileId(ctx, { projectId });
    if (!profileId) return [];
    return await ctx.db
      .query("entityClassRatings" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", profileId))
      .collect();
  },
});

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyRole(ctx, companyId, ["company_user"]);
    return await ctx.db
      .query("entityClassRatings" as any)
      .withIndex("by_companyId" as any, (q: any) => q.eq("companyId", companyId))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const addOrUpdate = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    category: categoryValidator,
    classNumber: classNumberValidator,
    limitations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const now = new Date().toISOString();
    // Upsert: find existing row for this profile + category + class
    const existing = await ctx.db
      .query("entityClassRatings" as any)
      .withIndex("by_entityProfileId_category" as any, (q: any) =>
        q.eq("entityProfileId", args.entityProfileId).eq("category", args.category)
      )
      .collect();
    const match = existing.find((r: any) => r.classNumber === args.classNumber);

    if (match) {
      await ctx.db.patch(match._id, {
        limitations: args.limitations,
        updatedAt: now,
      } as any);
      await invalidateApplicabilityCache(ctx, args.entityProfileId);
      return match._id;
    }

    const id = await ctx.db.insert("entityClassRatings" as any, {
      entityProfileId: args.entityProfileId,
      projectId: args.projectId,
      companyId: args.companyId,
      category: args.category,
      classNumber: args.classNumber,
      limitations: args.limitations,
      createdAt: now,
      updatedAt: now,
    } as any);
    await invalidateApplicabilityCache(ctx, args.entityProfileId);
    return id;
  },
});

export const remove = mutation({
  args: {
    ratingId: v.id("entityClassRatings" as any),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const row = await ctx.db.get(args.ratingId as any);
    if (!row) return;
    await ctx.db.delete(args.ratingId as any);
    await invalidateApplicabilityCache(ctx, (row as any).entityProfileId);
  },
});

export const removeAllForProfile = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const rows = await ctx.db
      .query("entityClassRatings" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", args.entityProfileId))
      .collect();
    await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    await invalidateApplicabilityCache(ctx, args.entityProfileId);
  },
});

// ── Cache invalidation helper ─────────────────────────────────────────────────

async function invalidateApplicabilityCache(ctx: any, entityProfileId: string) {
  const cached = await ctx.db
    .query("dctApplicabilityProfiles")
    .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", entityProfileId))
    .first();
  if (cached) await ctx.db.delete(cached._id);
}
