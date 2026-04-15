import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCompanyRole, requireProjectOwner } from "./_helpers";

function normalizeToken(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCapabilityTokens(args: {
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  authorizedFunctions?: string[];
  technicalDataRef?: string;
  notes?: string;
}): string[] {
  const tokens = new Set<string>();
  const raw = [
    args.articleDescription,
    args.make,
    args.model,
    args.partNumber,
    args.technicalDataRef,
    args.notes,
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
      .query("entityCapabilityList")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) => {
      const aNo = String(a.clNumber ?? "");
      const bNo = String(b.clNumber ?? "");
      if (aNo !== bNo) return aNo.localeCompare(bNo);
      return String(a.articleDescription ?? "").localeCompare(String(b.articleDescription ?? ""));
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
      .query("entityCapabilityList")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) => {
      const aNo = String(a.clNumber ?? "");
      const bNo = String(b.clNumber ?? "");
      if (aNo !== bNo) return aNo.localeCompare(bNo);
      return String(a.articleDescription ?? "").localeCompare(String(b.articleDescription ?? ""));
    });
    return rows;
  },
});

export const add = mutation({
  args: {
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
    return await ctx.db.insert("entityCapabilityList", {
      entityProfileId: profile._id,
      projectId: profile.projectId,
      companyId: profile.companyId,
      clNumber: args.clNumber,
      articleDescription: args.articleDescription.trim(),
      make: args.make,
      model: args.model,
      partNumber: args.partNumber,
      authorizedFunctions: args.authorizedFunctions,
      technicalDataRef: args.technicalDataRef,
      notes: args.notes,
      isActive: args.isActive ?? true,
      normalizedTokens: buildCapabilityTokens(args),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    capabilityId: v.id("entityCapabilityList"),
    clNumber: v.optional(v.string()),
    articleDescription: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.optional(v.array(v.string())),
    technicalDataRef: v.optional(v.string()),
    notes: v.optional(v.string()),
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
    const row = await ctx.db.get(args.capabilityId);
    if (!row) throw new Error("Capability item not found");
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("Capability item does not belong to this project profile");
    }
    const next = {
      articleDescription: args.articleDescription ?? row.articleDescription,
      make: args.make ?? row.make,
      model: args.model ?? row.model,
      partNumber: args.partNumber ?? row.partNumber,
      authorizedFunctions: args.authorizedFunctions ?? row.authorizedFunctions ?? [],
      technicalDataRef: args.technicalDataRef ?? row.technicalDataRef,
      notes: args.notes ?? row.notes,
    };
    await ctx.db.patch(args.capabilityId, {
      clNumber: args.clNumber ?? row.clNumber,
      articleDescription: next.articleDescription,
      make: next.make,
      model: next.model,
      partNumber: next.partNumber,
      authorizedFunctions: next.authorizedFunctions,
      technicalDataRef: next.technicalDataRef,
      notes: next.notes,
      isActive: args.isActive ?? row.isActive ?? true,
      normalizedTokens: buildCapabilityTokens(next),
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    capabilityId: v.id("entityCapabilityList"),
  },
  handler: async (ctx, { projectId, companyId, capabilityId }) => {
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
    const row = await ctx.db.get(capabilityId);
    if (!row) return;
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("Capability item does not belong to this project profile");
    }
    await ctx.db.delete(capabilityId);
  },
});

export const bulkUpsert = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    replaceAll: v.optional(v.boolean()),
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
        isActive: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { projectId, companyId, replaceAll, items }) => {
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
    const now = new Date().toISOString();
    if (replaceAll) {
      const existing = await ctx.db
        .query("entityCapabilityList")
        .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);
    }
    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      const dedupeKey = normalizeToken(
        `${item.clNumber ?? ""}|${item.articleDescription}|${item.make ?? ""}|${item.model ?? ""}|${item.partNumber ?? ""}`,
      );
      const existing = await ctx.db
        .query("entityCapabilityList")
        .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
        .collect();
      const match = existing.find((row: any) => {
        const rowKey = normalizeToken(
          `${row.clNumber ?? ""}|${row.articleDescription ?? ""}|${row.make ?? ""}|${row.model ?? ""}|${row.partNumber ?? ""}`,
        );
        return rowKey === dedupeKey;
      });
      const payload = {
        clNumber: item.clNumber,
        articleDescription: item.articleDescription.trim(),
        make: item.make,
        model: item.model,
        partNumber: item.partNumber,
        authorizedFunctions: item.authorizedFunctions,
        technicalDataRef: item.technicalDataRef,
        notes: item.notes,
        isActive: item.isActive ?? true,
        normalizedTokens: buildCapabilityTokens(item),
        updatedAt: now,
      };
      if (match) {
        await ctx.db.patch(match._id, payload);
        updated++;
      } else {
        await ctx.db.insert("entityCapabilityList", {
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
