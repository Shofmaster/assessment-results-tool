import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner, requireCompanyRole } from "./_helpers";

// ── Queries ──────────────────────────────────────────────────────────────────

export const listByEntityProfile = query({
  args: {
    entityProfileId: v.id("entityProfiles"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { entityProfileId, limit }) => {
    const q = ctx.db
      .query("entityCapabilityList" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", entityProfileId));
    return limit ? await q.take(limit) : await q.collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, { projectId, limit }) => {
    await requireProjectOwner(ctx, projectId);
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (!profile) return [];
    const q = ctx.db
      .query("entityCapabilityList" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", profile._id));
    return limit ? await q.take(limit) : await q.collect();
  },
});

export const listByCompany = query({
  args: { companyId: v.id("companies"), limit: v.optional(v.number()) },
  handler: async (ctx, { companyId, limit }) => {
    await requireCompanyRole(ctx, companyId, ["company_user"]);
    const q = ctx.db
      .query("entityCapabilityList" as any)
      .withIndex("by_companyId" as any, (q: any) => q.eq("companyId", companyId));
    return limit ? await q.take(limit) : await q.collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const add = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    clNumber: v.optional(v.string()),
    articleDescription: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.array(v.string()),
    technicalDataRef: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const now = new Date().toISOString();
    return await ctx.db.insert("entityCapabilityList" as any, {
      entityProfileId: args.entityProfileId,
      projectId: args.projectId,
      companyId: args.companyId,
      clNumber: args.clNumber,
      articleDescription: args.articleDescription,
      make: args.make,
      model: args.model,
      partNumber: args.partNumber,
      authorizedFunctions: args.authorizedFunctions,
      technicalDataRef: args.technicalDataRef,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    } as any);
  },
});

export const update = mutation({
  args: {
    itemId: v.id("entityCapabilityList" as any),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    clNumber: v.optional(v.string()),
    articleDescription: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.optional(v.array(v.string())),
    technicalDataRef: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const row = await ctx.db.get(args.itemId as any);
    if (!row) throw new Error("Capability list item not found");

    const now = new Date().toISOString();
    await ctx.db.patch(args.itemId as any, {
      ...(args.clNumber !== undefined && { clNumber: args.clNumber }),
      ...(args.articleDescription !== undefined && { articleDescription: args.articleDescription }),
      ...(args.make !== undefined && { make: args.make }),
      ...(args.model !== undefined && { model: args.model }),
      ...(args.partNumber !== undefined && { partNumber: args.partNumber }),
      ...(args.authorizedFunctions !== undefined && { authorizedFunctions: args.authorizedFunctions }),
      ...(args.technicalDataRef !== undefined && { technicalDataRef: args.technicalDataRef }),
      ...(args.notes !== undefined && { notes: args.notes }),
      updatedAt: now,
    } as any);
  },
});

export const remove = mutation({
  args: {
    itemId: v.id("entityCapabilityList" as any),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);
    await ctx.db.delete(args.itemId as any);
  },
});

/** Bulk insert from CSV import. Returns count of items inserted. */
export const bulkInsert = mutation({
  args: {
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    items: v.array(
      v.object({
        clNumber: v.optional(v.string()),
        articleDescription: v.string(),
        make: v.optional(v.string()),
        model: v.optional(v.string()),
        partNumber: v.optional(v.string()),
        authorizedFunctions: v.array(v.string()),
        technicalDataRef: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
    /** If true, delete all existing CL items for this profile before inserting. */
    replaceAll: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const now = new Date().toISOString();

    if (args.replaceAll) {
      const existing = await ctx.db
        .query("entityCapabilityList" as any)
        .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", args.entityProfileId))
        .collect();
      await Promise.all(existing.map((r: any) => ctx.db.delete(r._id)));
    }

    let inserted = 0;
    for (const item of args.items) {
      await ctx.db.insert("entityCapabilityList" as any, {
        entityProfileId: args.entityProfileId,
        projectId: args.projectId,
        companyId: args.companyId,
        clNumber: item.clNumber,
        articleDescription: item.articleDescription,
        make: item.make,
        model: item.model,
        partNumber: item.partNumber,
        authorizedFunctions: item.authorizedFunctions,
        technicalDataRef: item.technicalDataRef,
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      } as any);
      inserted++;
    }

    return { inserted };
  },
});
