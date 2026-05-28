import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireCompanyOrDelegatedSupportAccess } from "./_helpers";

const publicationTypeValidator = v.union(
  v.literal("maintenance_manual"),
  v.literal("parts_catalog"),
  v.literal("wiring_diagram"),
  v.literal("logbook_scan"),
  v.literal("other"),
);

export const get = query({
  args: { groupId: v.id("manualGroups") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.groupId);
    if (!row) return null;
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    return row;
  },
});

export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    publicationType: v.optional(publicationTypeValidator),
  },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    let rows = await ctx.db
      .query("manualGroups")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    if (args.publicationType) {
      rows = rows.filter(
        (r) => !r.publicationType || r.publicationType === args.publicationType,
      );
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

/** List groups for a company, each with a publicationCount aggregated from technicalPublications. */
export const listByCompanyWithCounts = query({
  args: {
    companyId: v.id("companies"),
    publicationType: v.optional(publicationTypeValidator),
  },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const groups = await ctx.db
      .query("manualGroups")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const pubs = await ctx.db
      .query("technicalPublications")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    const counts = new Map<string, number>();
    for (const p of pubs) {
      if (!p.manualGroupId) continue;
      if (args.publicationType && p.publicationType !== args.publicationType) continue;
      const key = String(p.manualGroupId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const filtered = args.publicationType
      ? groups.filter((g) => !g.publicationType || g.publicationType === args.publicationType)
      : groups;

    const out = filtered.map((g) => ({
      ...g,
      publicationCount: counts.get(String(g._id)) ?? 0,
    }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  },
});

export const create = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    publicationType: v.optional(publicationTypeValidator),
    manufacturer: v.optional(v.string()),
    makeModel: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const trimmedName = args.name.trim();
    if (!trimmedName) throw new Error("Group name is required");
    const now = new Date().toISOString();
    return await ctx.db.insert("manualGroups", {
      companyId: args.companyId,
      name: trimmedName,
      publicationType: args.publicationType,
      manufacturer: args.manufacturer,
      makeModel: args.makeModel,
      revisionNumber: args.revisionNumber,
      notes: args.notes,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    groupId: v.id("manualGroups"),
    name: v.optional(v.string()),
    publicationType: v.optional(publicationTypeValidator),
    manufacturer: v.optional(v.string()),
    makeModel: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.groupId);
    if (!row) throw new Error("Manual group not found");
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (!trimmed) throw new Error("Group name cannot be empty");
      patch.name = trimmed;
    }
    if (args.publicationType !== undefined) patch.publicationType = args.publicationType;
    if (args.manufacturer !== undefined) patch.manufacturer = args.manufacturer;
    if (args.makeModel !== undefined) patch.makeModel = args.makeModel;
    if (args.revisionNumber !== undefined) patch.revisionNumber = args.revisionNumber;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (Object.keys(patch).length === 0) return args.groupId;
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(args.groupId, patch);
    return args.groupId;
  },
});

/** Delete the group itself. Publications previously assigned are un-grouped (manualGroupId cleared)
 *  but their underlying documents are kept. */
export const remove = mutation({
  args: { groupId: v.id("manualGroups") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.groupId);
    if (!row) return;
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    const pubs = await ctx.db
      .query("technicalPublications")
      .withIndex("by_manualGroupId", (q) => q.eq("manualGroupId", args.groupId))
      .collect();
    const now = new Date().toISOString();
    for (const p of pubs) {
      await ctx.db.patch(p._id, { manualGroupId: undefined, updatedAt: now });
    }
    await ctx.db.delete(args.groupId);
  },
});

/** Assign one or more publications to a group. Pass groupId = null to un-group. */
export const assignPublications = mutation({
  args: {
    groupId: v.union(v.id("manualGroups"), v.null()),
    publicationIds: v.array(v.id("technicalPublications")),
  },
  handler: async (ctx, args) => {
    if (args.publicationIds.length === 0) return 0;

    let targetCompanyId: Id<"companies"> | null = null;
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (!group) throw new Error("Manual group not found");
      await requireCompanyOrDelegatedSupportAccess(ctx, group.companyId);
      targetCompanyId = group.companyId;
    }

    const now = new Date().toISOString();
    let updated = 0;
    for (const pid of args.publicationIds) {
      const pub = await ctx.db.get(pid);
      if (!pub) continue;
      // If we already validated against a group's company, the publication must match it.
      if (targetCompanyId && pub.companyId !== targetCompanyId) {
        throw new Error("Publication does not belong to this group's company");
      }
      // Otherwise (un-group case) we still need access to the publication's company.
      if (!targetCompanyId) {
        await requireCompanyOrDelegatedSupportAccess(ctx, pub.companyId);
      }
      await ctx.db.patch(pid, {
        manualGroupId: args.groupId ?? undefined,
        updatedAt: now,
      });
      updated += 1;
    }
    return updated;
  },
});
