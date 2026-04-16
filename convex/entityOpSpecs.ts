import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCompanyRole, requireProjectOwner } from "./_helpers";

/** Part 145 OpSpec paragraph titles (8900.1 Vol 2 Ch 3). Duplicated from UI catalog for Convex bundle. */
const OPSPEC_TITLE_BY_PARAGRAPH: Record<string, string> = {
  A001: "Issuance and applicability",
  A002: "Definitions and abbreviations",
  A003: "Ratings and limitations",
  A004: "Summary of authorizations",
  A025: "Specific maintenance authorizations",
  A049: "Hazardous materials authorization",
  A050: "Contract maintenance information",
  A060: "Special maintenance authorizations",
  A100: "Exemptions / deviations",
  A449: "Antidrug and alcohol misuse prevention program",
  D100: "Maintenance performed for certificate holders away from fixed location",
  D101: "Line maintenance",
  "Series A": "General (121/135)",
  "Series B": "En route (121/135)",
  "Series C": "Airports / heliports (121/135)",
  "Series D": "Maintenance (121/135)",
  "Series E": "Weight and balance (121/135)",
  "Series H": "Training (121/135)",
  "Series N": "Airplane exemptions (121/135)",
};

function titleForParagraph(paragraph: string, explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  return OPSPEC_TITLE_BY_PARAGRAPH[paragraph.trim()];
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
      .query("entityOpSpecs")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) => String(a.paragraph ?? "").localeCompare(String(b.paragraph ?? "")));
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
      .query("entityOpSpecs")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort((a: any, b: any) => String(a.paragraph ?? "").localeCompare(String(b.paragraph ?? "")));
    return rows;
  },
});

export const addOrUpdate = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    paragraph: v.string(),
    title: v.optional(v.string()),
    acceptedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
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
    const paragraph = args.paragraph.trim();
    const existing = await ctx.db
      .query("entityOpSpecs")
      .withIndex("by_entityProfileId_paragraph", (q: any) =>
        q.eq("entityProfileId", profile._id).eq("paragraph", paragraph),
      )
      .first();

    const patch = {
      authority: args.authority ?? "faa",
      title: titleForParagraph(paragraph, args.title),
      acceptedDate: args.acceptedDate,
      expiryDate: args.expiryDate,
      notes: args.notes,
      isActive: args.isActive,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("entityOpSpecs", {
      entityProfileId: profile._id,
      projectId: profile.projectId,
      companyId: profile.companyId,
      paragraph,
      ...patch,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    opSpecId: v.id("entityOpSpecs"),
  },
  handler: async (ctx, { projectId, companyId, opSpecId }) => {
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
    const row = await ctx.db.get(opSpecId);
    if (!row) return;
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("OpSpec does not belong to this profile");
    }
    await ctx.db.delete(opSpecId);
  },
});
