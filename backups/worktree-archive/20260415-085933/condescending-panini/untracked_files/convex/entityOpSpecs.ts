import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner, requireCompanyRole } from "./_helpers";

/** Standard Part 145 OpSpec paragraphs with their canonical titles. */
export const STANDARD_OPSPECS: Array<{ paragraph: string; title: string }> = [
  { paragraph: "A001", title: "General Certificate Information" },
  { paragraph: "A002", title: "Ratings and Limitations" },
  { paragraph: "A003", title: "Specific Ratings" },
  { paragraph: "A025", title: "Specific Maintenance Function Authorizations" },
  { paragraph: "A049", title: "Hazardous Materials Authorization" },
  { paragraph: "A050", title: "Deviation Authority" },
  { paragraph: "A060", title: "Special Maintenance Authorizations" },
  { paragraph: "A449", title: "Drug and Alcohol Testing Program" },
  { paragraph: "D100", title: "Work Performed Away from Fixed Location" },
];

// ── Queries ──────────────────────────────────────────────────────────────────

export const listByEntityProfile = query({
  args: { entityProfileId: v.id("entityProfiles") },
  handler: async (ctx, { entityProfileId }) => {
    return await ctx.db
      .query("entityOpSpecs" as any)
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
      .query("entityOpSpecs" as any)
      .withIndex("by_entityProfileId" as any, (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
  },
});

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyRole(ctx, companyId, ["company_user"]);
    return await ctx.db
      .query("entityOpSpecs" as any)
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
    paragraph: v.string(),
    title: v.optional(v.string()),
    acceptedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("entityOpSpecs" as any)
      .withIndex("by_entityProfileId_paragraph" as any, (q: any) =>
        q.eq("entityProfileId", args.entityProfileId).eq("paragraph", args.paragraph)
      )
      .first();

    const patch = {
      title: args.title ?? STANDARD_OPSPECS.find((s) => s.paragraph === args.paragraph)?.title,
      acceptedDate: args.acceptedDate,
      expiryDate: args.expiryDate,
      notes: args.notes,
      isActive: args.isActive,
      updatedAt: now,
    };

    let id: string;
    if (existing) {
      await ctx.db.patch(existing._id, patch as any);
      id = existing._id;
    } else {
      id = await ctx.db.insert("entityOpSpecs" as any, {
        entityProfileId: args.entityProfileId,
        projectId: args.projectId,
        companyId: args.companyId,
        paragraph: args.paragraph,
        ...patch,
        createdAt: now,
      } as any);
    }

    // Sync boolean shortcuts on entityProfiles
    await syncEntityProfileBooleans(ctx, args.entityProfileId, args.paragraph, args.isActive);
    await invalidateApplicabilityCache(ctx, args.entityProfileId);
    return id;
  },
});

export const toggleActive = mutation({
  args: {
    opSpecId: v.id("entityOpSpecs" as any),
    isActive: v.boolean(),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const row = await ctx.db.get(args.opSpecId as any);
    if (!row) return;
    const now = new Date().toISOString();
    await ctx.db.patch(args.opSpecId as any, { isActive: args.isActive, updatedAt: now } as any);
    await syncEntityProfileBooleans(ctx, (row as any).entityProfileId, (row as any).paragraph, args.isActive);
    await invalidateApplicabilityCache(ctx, (row as any).entityProfileId);
  },
});

export const remove = mutation({
  args: {
    opSpecId: v.id("entityOpSpecs" as any),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) await requireProjectOwner(ctx, args.projectId);
    if (args.companyId) await requireCompanyRole(ctx, args.companyId, ["company_manager"]);

    const row = await ctx.db.get(args.opSpecId as any);
    if (!row) return;
    await ctx.db.delete(args.opSpecId as any);
    await syncEntityProfileBooleans(ctx, (row as any).entityProfileId, (row as any).paragraph, false);
    await invalidateApplicabilityCache(ctx, (row as any).entityProfileId);
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Keep the boolean shortcut fields on entityProfiles in sync with OpSpec row state. */
async function syncEntityProfileBooleans(
  ctx: any,
  entityProfileId: string,
  paragraph: string,
  isActive: boolean
) {
  const patchMap: Record<string, string> = {
    D100: "d100Authorized",
    A449: "a449Enrolled",
    A050: "a050Authorized",
  };
  const field = patchMap[paragraph];
  if (field) {
    await ctx.db.patch(entityProfileId, { [field]: isActive });
  }
}

async function invalidateApplicabilityCache(ctx: any, entityProfileId: string) {
  const cached = await ctx.db
    .query("dctApplicabilityProfiles")
    .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", entityProfileId))
    .first();
  if (cached) await ctx.db.delete(cached._id);
}
