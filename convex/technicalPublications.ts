import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCompanyOrDelegatedSupportAccess, requireProjectAccess } from "./_helpers";
import {
  publicationAppliesToAircraft,
  publicationAppliesToAircraftType,
} from "./publicationScope";

async function assertAircraftTypesInProject(
  ctx: { db: any },
  aircraftTypeIds: Id<"aircraftTypes">[] | undefined,
  projectId: Id<"projects">,
) {
  if (!aircraftTypeIds?.length) return;
  for (const tid of aircraftTypeIds) {
    const row = await ctx.db.get(tid);
    if (!row || row.projectId !== projectId) {
      throw new Error("Each linked aircraft type must belong to the same project");
    }
  }
}

const publicationTypeValidator = v.union(
  v.literal("maintenance_manual"),
  v.literal("parts_catalog"),
  v.literal("wiring_diagram"),
  v.literal("logbook_scan"),
  v.literal("other"),
);

async function assertProjectBelongsToCompany(
  ctx: { db: any },
  projectId: Id<"projects">,
  companyId: Id<"companies">,
) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  if (project.companyId !== companyId) {
    throw new Error("Project must belong to the same company as the publication");
  }
}

async function assertDocumentInProject(
  ctx: { db: any },
  documentId: Id<"documents">,
  projectId: Id<"projects">,
) {
  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found");
  if (doc.projectId !== projectId) {
    throw new Error("Document does not belong to this project");
  }
}

function documentCategoryForPublicationType(
  t:
    | "maintenance_manual"
    | "parts_catalog"
    | "wiring_diagram"
    | "logbook_scan"
    | "other",
): string {
  if (t === "other") return "uploaded";
  return t;
}

export const get = query({
  args: { publicationId: v.id("technicalPublications") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.publicationId);
    if (!row) return null;
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    return row;
  },
});

export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    publicationType: v.optional(publicationTypeValidator),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
    /** Filter to publications applicable to this tail (scope resolution). */
    aircraftId: v.optional(v.id("aircraftAssets")),
    /** Filter to publications applicable to this type (scope resolution). */
    aircraftTypeId: v.optional(v.id("aircraftTypes")),
    /** Required when filtering by aircraftId or aircraftTypeId. */
    scopeProjectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    let rows = await ctx.db
      .query("technicalPublications")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    if (args.publicationType) {
      rows = rows.filter((r) => r.publicationType === args.publicationType);
    }
    if (args.folderId !== undefined) {
      if (args.folderId === null) rows = rows.filter((r) => !r.folderId);
      else rows = rows.filter((r) => r.folderId === args.folderId);
    }

    if (args.aircraftId && args.scopeProjectId) {
      await requireProjectAccess(ctx, args.scopeProjectId);
      const aircraft = await ctx.db.get(args.aircraftId);
      if (!aircraft || aircraft.projectId !== args.scopeProjectId) {
        return [];
      }
      rows = rows.filter((r) =>
        publicationAppliesToAircraft(r, args.aircraftId!, aircraft.aircraftTypeId),
      );
    } else if (args.aircraftTypeId && args.scopeProjectId) {
      await requireProjectAccess(ctx, args.scopeProjectId);
      const typeRow = await ctx.db.get(args.aircraftTypeId);
      if (!typeRow || typeRow.projectId !== args.scopeProjectId) {
        return [];
      }
      const tails = await ctx.db
        .query("aircraftAssets")
        .withIndex("by_projectId_aircraftTypeId", (q) =>
          q.eq("projectId", args.scopeProjectId!).eq("aircraftTypeId", args.aircraftTypeId!),
        )
        .collect();
      const tailIds = tails.map((t) => t._id);
      rows = rows.filter((r) => publicationAppliesToAircraftType(r, args.aircraftTypeId!, tailIds));
    }

    rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return rows;
  },
});

/** Publications linked to this aircraft or with no explicit link (fleet-wide for that company). */
export const listByAircraft = query({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const aircraft = await ctx.db.get(args.aircraftId);
    if (!aircraft || aircraft.projectId !== args.projectId) {
      throw new Error("Aircraft not found in this project");
    }
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) return [];

    const rows = await ctx.db
      .query("technicalPublications")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
      .collect();

    return rows.filter((r) =>
      publicationAppliesToAircraft(r, args.aircraftId, aircraft.aircraftTypeId),
    );
  },
});

export const create = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    documentId: v.id("documents"),
    title: v.string(),
    publicationType: publicationTypeValidator,
    makeModel: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    revisionDate: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
    aircraftIds: v.optional(v.array(v.id("aircraftAssets"))),
    aircraftTypeIds: v.optional(v.array(v.id("aircraftTypes"))),
    notes: v.optional(v.string()),
    folderId: v.optional(v.id("libraryFolders")),
  },
  handler: async (ctx, args) => {
    const userId = await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    await requireProjectAccess(ctx, args.projectId);
    await assertProjectBelongsToCompany(ctx, args.projectId, args.companyId);
    await assertDocumentInProject(ctx, args.documentId, args.projectId);
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.companyId !== args.companyId) {
        throw new Error("Folder does not belong to this company");
      }
    }

    const doc = await ctx.db.get(args.documentId);
    if (doc) {
      const desired = documentCategoryForPublicationType(args.publicationType);
      if (doc.category !== desired && doc.category !== "logbook") {
        await ctx.db.patch(args.documentId, { category: desired });
        await ctx.scheduler.runAfter(0, internal.documentChunks.indexDocument, {
          documentId: args.documentId,
        });
      }
    }

    if (args.aircraftIds?.length) {
      for (const aid of args.aircraftIds) {
        const ac = await ctx.db.get(aid);
        if (!ac || ac.projectId !== args.projectId) {
          throw new Error("Each linked aircraft must belong to the same project");
        }
      }
    }
    await assertAircraftTypesInProject(ctx, args.aircraftTypeIds, args.projectId);

    const now = new Date().toISOString();
    const id = await ctx.db.insert("technicalPublications", {
      companyId: args.companyId,
      projectId: args.projectId,
      documentId: args.documentId,
      title: args.title,
      publicationType: args.publicationType,
      makeModel: args.makeModel,
      manufacturer: args.manufacturer,
      partNumber: args.partNumber,
      revisionNumber: args.revisionNumber,
      revisionDate: args.revisionDate,
      effectiveDate: args.effectiveDate,
      aircraftIds: args.aircraftIds,
      aircraftTypeIds: args.aircraftTypeIds,
      uploadedBy: userId,
      notes: args.notes,
      folderId: args.folderId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return id;
  },
});

export const update = mutation({
  args: {
    publicationId: v.id("technicalPublications"),
    title: v.optional(v.string()),
    publicationType: v.optional(publicationTypeValidator),
    makeModel: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    revisionDate: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
    aircraftIds: v.optional(v.array(v.id("aircraftAssets"))),
    aircraftTypeIds: v.optional(v.array(v.id("aircraftTypes"))),
    notes: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.publicationId);
    if (!row) throw new Error("Publication not found");
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    const { publicationId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.publicationType !== undefined) patch.publicationType = updates.publicationType;
    if (updates.makeModel !== undefined) patch.makeModel = updates.makeModel;
    if (updates.manufacturer !== undefined) patch.manufacturer = updates.manufacturer;
    if (updates.partNumber !== undefined) patch.partNumber = updates.partNumber;
    if (updates.revisionNumber !== undefined) patch.revisionNumber = updates.revisionNumber;
    if (updates.revisionDate !== undefined) patch.revisionDate = updates.revisionDate;
    if (updates.effectiveDate !== undefined) patch.effectiveDate = updates.effectiveDate;
    if (updates.aircraftIds !== undefined) {
      for (const aid of updates.aircraftIds) {
        const ac = await ctx.db.get(aid);
        if (!ac || ac.projectId !== row.projectId) {
          throw new Error("Each linked aircraft must belong to the publication's project");
        }
      }
      patch.aircraftIds = updates.aircraftIds.length ? updates.aircraftIds : undefined;
    }
    if (updates.aircraftTypeIds !== undefined) {
      await assertAircraftTypesInProject(ctx, updates.aircraftTypeIds, row.projectId);
      patch.aircraftTypeIds = updates.aircraftTypeIds.length ? updates.aircraftTypeIds : undefined;
    }
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.folderId !== undefined) {
      if (updates.folderId === null) {
        patch.folderId = undefined;
      } else {
        const folder = await ctx.db.get(updates.folderId);
        if (!folder || folder.companyId !== row.companyId) {
          throw new Error("Folder does not belong to this company");
        }
        patch.folderId = updates.folderId;
      }
    }
    if (Object.keys(patch).length === 0) return publicationId;
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(publicationId, patch);
    await ctx.db.patch(row.projectId, { updatedAt: patch.updatedAt as string });
    return publicationId;
  },
});

export const linkAircraftType = mutation({
  args: {
    publicationId: v.id("technicalPublications"),
    aircraftTypeId: v.id("aircraftTypes"),
    unlink: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.publicationId);
    if (!row) throw new Error("Publication not found");
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    const typeRow = await ctx.db.get(args.aircraftTypeId);
    if (!typeRow || typeRow.projectId !== row.projectId) {
      throw new Error("Aircraft type not in publication project");
    }
    const current = row.aircraftTypeIds ?? [];
    let next: Id<"aircraftTypes">[];
    if (args.unlink) {
      next = current.filter((id) => id !== args.aircraftTypeId);
    } else if (!current.includes(args.aircraftTypeId)) {
      next = [...current, args.aircraftTypeId];
    } else {
      next = current;
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.publicationId, {
      aircraftTypeIds: next.length ? next : undefined,
      updatedAt: now,
    });
    await ctx.db.patch(row.projectId, { updatedAt: now });
    return args.publicationId;
  },
});

export const linkAircraft = mutation({
  args: {
    publicationId: v.id("technicalPublications"),
    aircraftId: v.id("aircraftAssets"),
    unlink: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.publicationId);
    if (!row) throw new Error("Publication not found");
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);
    const ac = await ctx.db.get(args.aircraftId);
    if (!ac || ac.projectId !== row.projectId) {
      throw new Error("Aircraft not in publication project");
    }
    const current = row.aircraftIds ?? [];
    let next: Id<"aircraftAssets">[];
    if (args.unlink) {
      next = current.filter((id) => id !== args.aircraftId);
    } else if (!current.includes(args.aircraftId)) {
      next = [...current, args.aircraftId];
    } else {
      next = current;
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.publicationId, {
      aircraftIds: next.length ? next : undefined,
      updatedAt: now,
    });
    await ctx.db.patch(row.projectId, { updatedAt: now });
    return args.publicationId;
  },
});

export const remove = mutation({
  args: { publicationId: v.id("technicalPublications") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.publicationId);
    if (!row) return;
    await requireCompanyOrDelegatedSupportAccess(ctx, row.companyId);

    const sections = await ctx.db
      .query("publicationSections")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", args.publicationId))
      .collect();
    for (const s of sections) {
      await ctx.db.delete(s._id);
    }

    const doc = await ctx.db.get(row.documentId);
    if (doc) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      if (doc.extractedTextStorageId) await ctx.storage.delete(doc.extractedTextStorageId);
      await ctx.scheduler.runAfter(0, internal.documentChunks.clearForDocument, { documentId: doc._id });
      await ctx.db.delete(doc._id);
    }

    await ctx.db.delete(args.publicationId);
    const now = new Date().toISOString();
    await ctx.db.patch(row.projectId, { updatedAt: now });
  },
});
