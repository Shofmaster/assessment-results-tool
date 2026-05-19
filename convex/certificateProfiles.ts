import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireProjectAccess } from "./_helpers";
import { resolveActiveCertificateProfile, resolveObligationSetVersionForProfile } from "./lib/profileEngine";
import { DEFAULT_OBLIGATION_PACKS } from "./lib/profileObligationPacks";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const projectRows = await ctx.db
      .query("certificateProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) return projectRows;

    const companyRows = await ctx.db
      .query("certificateProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId))
      .collect();

    const seen = new Set<string>();
    const merged = [...projectRows, ...companyRows].filter((row) => {
      const key = String(row._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return merged.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
});

export const resolveForProject = query({
  args: { projectId: v.id("projects"), legacyProfileId: v.optional(v.id("entityProfiles")) },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const profile = await resolveActiveCertificateProfile(ctx as any, args.projectId, args.legacyProfileId);
    if (!profile) return null;
    const obligationSetVersion = await resolveObligationSetVersionForProfile(ctx as any, profile);
    return {
      ...profile,
      resolvedObligationSetVersion: obligationSetVersion,
    };
  },
});

export const listObligationDefinitionsByProfile = query({
  args: { profileCode: v.string() },
  handler: async (ctx, args) => {
    // Read-only endpoint; caller access is enforced by using a profileCode already scoped from project APIs.
    const rows = await ctx.db
      .query("obligationSetDefinitions")
      .withIndex("by_profileCode", (q) => q.eq("profileCode", args.profileCode))
      .collect();
    return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
});

export const upsertObligationSetDefinition = mutation({
  args: {
    profileCode: v.string(),
    authority: v.union(
      v.literal("faa"),
      v.literal("easa"),
      v.literal("isbao"),
      v.literal("as9100"),
      v.literal("icao"),
      v.literal("other"),
    ),
    certificateType: v.union(
      v.literal("part145"),
      v.literal("part135"),
      v.literal("part121"),
      v.literal("part125"),
      v.literal("part129"),
      v.literal("part133"),
      v.literal("part137"),
      v.literal("part141"),
      v.literal("part142"),
      v.literal("part147"),
      v.literal("part91k"),
      v.literal("part91loa"),
      v.literal("easa145"),
      v.literal("isbao"),
      v.literal("as9100"),
      v.literal("custom"),
    ),
    version: v.string(),
    rules: v.array(
      v.object({
        ruleId: v.string(),
        sourceReference: v.optional(v.string()),
        intervalType: v.optional(v.string()),
        intervalValue: v.optional(v.number()),
        gracePolicy: v.optional(v.string()),
        anchorPolicy: v.optional(v.string()),
        defaultOwnerRole: v.optional(v.string()),
        escalationPolicy: v.optional(v.string()),
        evidenceRequirement: v.optional(v.string()),
        createsChecklistTemplate: v.optional(v.boolean()),
        reportSectionMapping: v.optional(v.string()),
        severity: v.optional(
          v.union(
            v.literal("critical"),
            v.literal("major"),
            v.literal("minor"),
            v.literal("observation"),
          ),
        ),
      }),
    ),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actorId = await requireAdmin(ctx);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("obligationSetDefinitions")
      .withIndex("by_profileCode", (q) => q.eq("profileCode", args.profileCode))
      .collect();

    const exact = existing.find((row) => row.version === args.version);
    if (exact) {
      await ctx.db.patch(exact._id, {
        authority: args.authority,
        certificateType: args.certificateType,
        rules: args.rules,
        isActive: args.isActive,
        updatedAt: now,
      });
      return exact._id;
    }

    return await ctx.db.insert("obligationSetDefinitions", {
      profileCode: args.profileCode,
      authority: args.authority,
      certificateType: args.certificateType,
      version: args.version,
      rules: args.rules,
      isActive: args.isActive,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
    });
  },
});

export const seedDefaultObligationSets = mutation({
  args: {},
  handler: async (ctx) => {
    const actorId = await requireAdmin(ctx);
    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;

    for (const pack of DEFAULT_OBLIGATION_PACKS) {
      const existing = await ctx.db
        .query("obligationSetDefinitions")
        .withIndex("by_profileCode", (q) => q.eq("profileCode", pack.profileCode))
        .collect();
      const match = existing.find((row) => row.version === pack.version);
      if (match) {
        await ctx.db.patch(match._id, {
          authority: pack.authority,
          certificateType: pack.certificateType,
          rules: pack.rules,
          isActive: true,
          updatedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("obligationSetDefinitions", {
          profileCode: pack.profileCode,
          authority: pack.authority,
          certificateType: pack.certificateType,
          version: pack.version,
          rules: pack.rules,
          isActive: true,
          createdAt: now,
          createdBy: actorId,
          updatedAt: now,
        });
        inserted += 1;
      }
    }

    return {
      defaults: DEFAULT_OBLIGATION_PACKS.length,
      inserted,
      updated,
    };
  },
});

