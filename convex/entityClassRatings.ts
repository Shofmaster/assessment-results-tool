import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCompanyRole, requireProjectOwner } from "./_helpers";
import { pruneDeletedIdFromAllDctSettings } from "./lib/dctSelectedIds";

function normalizeToken(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildRatingTokens(args: {
  category: string;
  classNumber: number;
  limitations?: string;
}): string[] {
  const tokens = new Set<string>();
  const category = normalizeToken(args.category);
  tokens.add(category);
  tokens.add(`${category} class ${args.classNumber}`);
  tokens.add(`class ${args.classNumber}`);
  if (args.limitations) {
    for (const part of args.limitations.split(/[,;/]/g)) {
      const token = normalizeToken(part);
      if (token) tokens.add(token);
    }
  }
  return [...tokens];
}

async function getProfileForProject(ctx: any, projectId: string) {
  const project = await ctx.db.get(projectId);
  if (!project) return null;
  if (project.companyId) {
    return await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", project.companyId))
      .first();
  }
  return await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
}

/** Ensures a profile row exists so structured ratings can be stored (e.g. before org card is saved). */
async function ensureProfileForProject(ctx: any, projectId: string, userId: string) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  const now = new Date().toISOString();
  if (project.companyId) {
    const existing = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", project.companyId))
      .first();
    if (existing) return existing;
    const profileId = await ctx.db.insert("entityProfiles", {
      companyId: project.companyId,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(profileId);
    if (!created) throw new Error("Failed to create organization profile");
    return created;
  }
  const existing = await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
  if (existing) return existing;
  const profileId = await ctx.db.insert("entityProfiles", {
    projectId,
    userId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(profileId);
  if (!created) throw new Error("Failed to create entity profile");
  return created;
}

async function ensureProfileForCompany(ctx: any, companyId: string, userId: string) {
  const existing = await ctx.db
    .query("entityProfiles")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .first();
  if (existing) return existing;
  const now = new Date().toISOString();
  const profileId = await ctx.db.insert("entityProfiles", {
    companyId,
    userId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(profileId);
  if (!created) throw new Error("Failed to create organization profile");
  return created;
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const profile = await getProfileForProject(ctx, projectId);
    if (!profile) return [];
    const rows = await ctx.db
      .query("entityClassRatings")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) => {
      const categoryCmp = String(a.category).localeCompare(String(b.category));
      if (categoryCmp !== 0) return categoryCmp;
      return Number(a.classNumber ?? 0) - Number(b.classNumber ?? 0);
    });
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
      .query("entityClassRatings")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) => {
      const categoryCmp = String(a.category).localeCompare(String(b.category));
      if (categoryCmp !== 0) return categoryCmp;
      return Number(a.classNumber ?? 0) - Number(b.classNumber ?? 0);
    });
    return rows;
  },
});

export const upsert = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    category: v.string(),
    classNumber: v.number(),
    limitations: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (args.projectId) {
      const userId = await requireProjectOwner(ctx, args.projectId);
      profile = await ensureProfileForProject(ctx, args.projectId, userId);
    } else {
      const userId = await requireCompanyRole(ctx, args.companyId!, ["company_admin", "company_manager"]);
      profile = await ensureProfileForCompany(ctx, args.companyId!, userId);
    }
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("entityClassRatings")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    const normalizedCategory = normalizeToken(args.category);
    const wantAuthority = args.authority ?? "faa";
    const match = existing.find(
      (row: any) =>
        (row.authority ?? "faa") === wantAuthority &&
        normalizeToken(String(row.category ?? "")) === normalizedCategory &&
        Number(row.classNumber ?? 0) === Number(args.classNumber),
    );
    const authority = wantAuthority;
    const payload = {
      authority,
      category: normalizedCategory,
      classNumber: args.classNumber,
      limitations: args.limitations,
      isActive: args.isActive ?? true,
      normalizedTokens: buildRatingTokens({
        category: normalizedCategory,
        classNumber: args.classNumber,
        limitations: args.limitations,
      }),
      updatedAt: now,
    };
    if (match) {
      await ctx.db.patch(match._id, payload);
      return match._id;
    }
    return await ctx.db.insert("entityClassRatings", {
      entityProfileId: profile._id,
      projectId: profile.projectId,
      companyId: profile.companyId,
      ...payload,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    ratingId: v.id("entityClassRatings"),
  },
  handler: async (ctx, { projectId, companyId, ratingId }) => {
    if (!projectId && !companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (projectId) {
      const userId = await requireProjectOwner(ctx, projectId);
      profile = await ensureProfileForProject(ctx, projectId, userId);
    } else {
      const userId = await requireCompanyRole(ctx, companyId!, ["company_admin", "company_manager"]);
      profile = await ensureProfileForCompany(ctx, companyId!, userId);
    }
    const row = await ctx.db.get(ratingId);
    if (!row) return;
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("Rating does not belong to this project profile");
    }
    await ctx.db.delete(ratingId);
    await pruneDeletedIdFromAllDctSettings(ctx, { ratingId });
  },
});

export const bulkUpsert = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    items: v.array(
      v.object({
        authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
        category: v.string(),
        classNumber: v.number(),
        limitations: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
      }),
    ),
    replaceAll: v.optional(v.boolean()),
  },
  handler: async (ctx, { projectId, companyId, items, replaceAll }) => {
    if (!projectId && !companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (projectId) {
      const userId = await requireProjectOwner(ctx, projectId);
      profile = await ensureProfileForProject(ctx, projectId, userId);
    } else {
      const userId = await requireCompanyRole(ctx, companyId!, ["company_admin", "company_manager"]);
      profile = await ensureProfileForCompany(ctx, companyId!, userId);
    }
    const now = new Date().toISOString();
    if (replaceAll) {
      const existing = await ctx.db
        .query("entityClassRatings")
        .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);
    }
    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      const normalizedCategory = normalizeToken(item.category);
      const wantAuthority = item.authority ?? "faa";
      const existing = await ctx.db
        .query("entityClassRatings")
        .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
        .collect();
      const match = existing.find(
        (row: any) =>
          (row.authority ?? "faa") === wantAuthority &&
          normalizeToken(String(row.category ?? "")) === normalizedCategory &&
          Number(row.classNumber ?? 0) === Number(item.classNumber),
      );
      const authority = wantAuthority;
      const payload = {
        authority,
        category: normalizedCategory,
        classNumber: item.classNumber,
        limitations: item.limitations,
        isActive: item.isActive ?? true,
        normalizedTokens: buildRatingTokens({
          category: normalizedCategory,
          classNumber: item.classNumber,
          limitations: item.limitations,
        }),
        updatedAt: now,
      };
      if (match) {
        await ctx.db.patch(match._id, payload);
        updated++;
      } else {
        await ctx.db.insert("entityClassRatings", {
          entityProfileId: profile._id,
          projectId: profile.projectId,
          companyId: profile.companyId,
          ...payload,
          createdAt: now,
        });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});
