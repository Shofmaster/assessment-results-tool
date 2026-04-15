import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner, requireCompanyRole } from "./_helpers";

/** Increment this when the applicability engine's mapping rules change. */
export const CURRENT_ENGINE_VERSION = 1;

// ── Queries ──────────────────────────────────────────────────────────────────

export const getByEntityProfile = query({
  args: { entityProfileId: v.id("entityProfiles") },
  handler: async (ctx, { entityProfileId }) => {
    const cached = await ctx.db
      .query("dctApplicabilityProfiles" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", entityProfileId))
      .first();
    if (!cached || (cached as any).version !== CURRENT_ENGINE_VERSION) return null;
    return cached;
  },
});

export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (!profile) return null;
    const cached = await ctx.db
      .query("dctApplicabilityProfiles" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", profile._id))
      .first();
    if (!cached || (cached as any).version !== CURRENT_ENGINE_VERSION) return null;
    return cached;
  },
});

export const getByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyRole(ctx, companyId, ["company_user"]);
    const cached = await ctx.db
      .query("dctApplicabilityProfiles" as any)
      .withIndex("by_companyId" as any, (q: any) => q.eq("companyId", companyId))
      .first();
    if (!cached || (cached as any).version !== CURRENT_ENGINE_VERSION) return null;
    return cached;
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/** Store a computed applicability result (called by the client after running the engine). */
export const store = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    applicableElementIds: v.array(v.string()),
    applicablePeerGroup: v.union(v.literal("F"), v.literal("G"), v.literal("H")),
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    // Delete stale cached rows for this entity
    const existing = await ctx.db
      .query("dctApplicabilityProfiles" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", args.entityProfileId))
      .collect();
    await Promise.all(existing.map((r: any) => ctx.db.delete(r._id)));

    return await ctx.db.insert("dctApplicabilityProfiles" as any, {
      entityProfileId: args.entityProfileId,
      projectId: args.projectId,
      companyId: args.companyId,
      computedAt: new Date().toISOString(),
      applicableElementIds: args.applicableElementIds,
      applicablePeerGroup: args.applicablePeerGroup,
      rationale: args.rationale,
      version: CURRENT_ENGINE_VERSION,
    } as any);
  },
});

/** Invalidate (delete) the cached profile so it will be recomputed on next use. */
export const invalidate = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const existing = await ctx.db
      .query("dctApplicabilityProfiles" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", args.entityProfileId))
      .collect();
    await Promise.all(existing.map((r: any) => ctx.db.delete(r._id)));
  },
});
