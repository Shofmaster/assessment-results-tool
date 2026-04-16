import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCompanyRole, requireProjectOwner } from "./_helpers";

function normalizeToken(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildLimitedTokens(args: {
  ratingKind: string;
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  limitations?: string;
  easaCategory?: string;
  easaRating?: string;
  authorizedFunctions?: string[];
}): string[] {
  const tokens = new Set<string>();
  const raw = [
    args.ratingKind,
    args.articleDescription,
    args.make,
    args.model,
    args.partNumber,
    args.limitations,
    args.easaCategory,
    args.easaRating,
    ...(args.authorizedFunctions ?? []),
  ].filter(Boolean) as string[];
  for (const value of raw) {
    const normalized = normalizeToken(value);
    if (!normalized) continue;
    tokens.add(normalized);
    for (const part of normalized.split(/[,;/]/g)) {
      const token = normalizeToken(part);
      if (token) tokens.add(token);
    }
  }
  return [...tokens];
}

async function resolveProfileForProject(ctx: any, projectId: string) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  if (project.companyId) {
    const byCompany = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", project.companyId))
      .first();
    if (!byCompany) throw new Error("Organization profile not found");
    return byCompany;
  }
  const byProject = await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
  if (!byProject) throw new Error("Entity profile not found");
  return byProject;
}

async function resolveProfileForCompany(ctx: any, companyId: string) {
  const profile = await ctx.db
    .query("entityProfiles")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .first();
  if (!profile) throw new Error("Organization profile not found");
  return profile;
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const profile = await resolveProfileForProject(ctx, projectId);
    const rows = await ctx.db
      .query("entityLimitedRatings")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) =>
      String(a.articleDescription ?? "").localeCompare(String(b.articleDescription ?? "")),
    );
    return rows;
  },
});

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyRole(ctx, companyId, ["company_admin", "company_manager", "company_user"]);
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .first();
    if (!profile) return [];
    const rows = await ctx.db
      .query("entityLimitedRatings")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) =>
      String(a.articleDescription ?? "").localeCompare(String(b.articleDescription ?? "")),
    );
    return rows;
  },
});

export const add = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    ratingKind: v.string(),
    articleDescription: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.array(v.string()),
    easaCategory: v.optional(v.string()),
    easaRating: v.optional(v.string()),
    limitations: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (args.projectId) {
      await requireProjectOwner(ctx, args.projectId);
      profile = await resolveProfileForProject(ctx, args.projectId);
    } else {
      await requireCompanyRole(ctx, args.companyId!, ["company_admin", "company_manager"]);
      profile = await resolveProfileForCompany(ctx, args.companyId!);
    }
    const now = new Date().toISOString();
    const payload = {
      entityProfileId: profile._id,
      projectId: profile.projectId,
      companyId: profile.companyId,
      authority: args.authority ?? "faa",
      ratingKind: args.ratingKind.trim(),
      articleDescription: args.articleDescription.trim(),
      make: args.make,
      model: args.model,
      partNumber: args.partNumber,
      authorizedFunctions: args.authorizedFunctions,
      easaCategory: args.easaCategory,
      easaRating: args.easaRating,
      limitations: args.limitations,
      isActive: args.isActive ?? true,
      normalizedTokens: buildLimitedTokens({
        ratingKind: args.ratingKind,
        articleDescription: args.articleDescription,
        make: args.make,
        model: args.model,
        partNumber: args.partNumber,
        limitations: args.limitations,
        easaCategory: args.easaCategory,
        easaRating: args.easaRating,
        authorizedFunctions: args.authorizedFunctions,
      }),
      createdAt: now,
      updatedAt: now,
    };
    return await ctx.db.insert("entityLimitedRatings", payload);
  },
});

export const update = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    ratingId: v.id("entityLimitedRatings"),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    ratingKind: v.optional(v.string()),
    articleDescription: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.optional(v.array(v.string())),
    easaCategory: v.optional(v.string()),
    easaRating: v.optional(v.string()),
    limitations: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (args.projectId) {
      await requireProjectOwner(ctx, args.projectId);
      profile = await resolveProfileForProject(ctx, args.projectId);
    } else {
      await requireCompanyRole(ctx, args.companyId!, ["company_admin", "company_manager"]);
      profile = await resolveProfileForCompany(ctx, args.companyId!);
    }
    const row = await ctx.db.get(args.ratingId);
    if (!row) throw new Error("Limited rating not found");
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("Limited rating does not belong to this profile");
    }
    const next = {
      authority: args.authority ?? row.authority ?? "faa",
      ratingKind: (args.ratingKind ?? row.ratingKind).trim(),
      articleDescription: (args.articleDescription ?? row.articleDescription).trim(),
      make: args.make ?? row.make,
      model: args.model ?? row.model,
      partNumber: args.partNumber ?? row.partNumber,
      authorizedFunctions: args.authorizedFunctions ?? row.authorizedFunctions ?? [],
      easaCategory: args.easaCategory ?? row.easaCategory,
      easaRating: args.easaRating ?? row.easaRating,
      limitations: args.limitations ?? row.limitations,
      isActive: args.isActive ?? row.isActive ?? true,
    };
    await ctx.db.patch(args.ratingId, {
      ...next,
      normalizedTokens: buildLimitedTokens({
        ratingKind: next.ratingKind,
        articleDescription: next.articleDescription,
        make: next.make,
        model: next.model,
        partNumber: next.partNumber,
        limitations: next.limitations,
        easaCategory: next.easaCategory,
        easaRating: next.easaRating,
        authorizedFunctions: next.authorizedFunctions,
      }),
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    ratingId: v.id("entityLimitedRatings"),
  },
  handler: async (ctx, { projectId, companyId, ratingId }) => {
    if (!projectId && !companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (projectId) {
      await requireProjectOwner(ctx, projectId);
      profile = await resolveProfileForProject(ctx, projectId);
    } else {
      await requireCompanyRole(ctx, companyId!, ["company_admin", "company_manager"]);
      profile = await resolveProfileForCompany(ctx, companyId!);
    }
    const row = await ctx.db.get(ratingId);
    if (!row) return;
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("Limited rating does not belong to this profile");
    }
    await ctx.db.delete(ratingId);
  },
});
