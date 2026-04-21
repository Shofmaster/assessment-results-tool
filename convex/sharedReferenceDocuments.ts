import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  requireAuth,
  requireAdmin,
  requirePlatformStaff,
  requireCompanyRole,
  requireCompanyOrDelegatedSupportAccess,
  requireProjectAccess,
} from "./_helpers";
import { sharedDocVisibleForCompany } from "./sharedDocVisibility";
import { dctParsedToolDocumentInValidator } from "./lib/dctValidators";

/** Tenant refs for company plus platform-wide refs (no companyId). Used by DCT ingest. */
export async function collectVisibleForCompany(
  ctx: { db: any },
  companyId: Id<"companies">,
) {
  const tenant = await ctx.db
    .query("sharedReferenceDocuments")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .collect();
  const all = await ctx.db.query("sharedReferenceDocuments").collect();
  const platform = all.filter((d: any) => d.companyId === undefined);
  const seen = new Set(tenant.map((d: any) => d._id));
  for (const d of platform) {
    if (!seen.has(d._id)) tenant.push(d);
  }
  return tenant;
}

async function requireRemoveSharedRef(ctx: any, doc: any) {
  if (!doc.companyId) {
    await requirePlatformStaff(ctx);
    return;
  }
  await requireCompanyRole(ctx, doc.companyId, ["company_admin", "company_manager"]);
}

export const listForCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    return await collectVisibleForCompany(ctx, args.companyId);
  },
});

/** @deprecated Prefer listForCompany. Returns platform-wide docs only (no tenant uploads). */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const all = await ctx.db.query("sharedReferenceDocuments").collect();
    return all.filter((d: any) => d.companyId === undefined);
  },
});

export const listAllAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("sharedReferenceDocuments").collect();
  },
});

export const listByType = query({
  args: {
    documentType: v.string(),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const byType = await ctx.db
      .query("sharedReferenceDocuments")
      .withIndex("by_documentType", (q) => q.eq("documentType", args.documentType))
      .collect();
    return byType.filter((doc: any) =>
      sharedDocVisibleForCompany(doc.companyId, args.companyId),
    );
  },
});

export const add = mutation({
  args: {
    documentType: v.string(),
    canonicalDocType: v.optional(v.string()),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    sourceUrl: v.optional(v.string()),
    issuer: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
    revision: v.optional(v.string()),
    notes: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { companyId: tenantId, ...rest } = args;
    const addedBy =
      tenantId === undefined
        ? await requirePlatformStaff(ctx)
        : await requireCompanyRole(ctx, tenantId, ["company_admin", "company_manager"]);
    const row = {
      ...rest,
      companyId: tenantId,
      addedAt: new Date().toISOString(),
      addedBy,
    };
    return await ctx.db.insert("sharedReferenceDocuments", row);
  },
});

/**
 * Project members may upload FAA SAS DCT XML into the company shared reference library
 * (same visibility as other tenant shared refs). Restricted to type faa_sas_dct.
 */
export const addDctXmlFromProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    path: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    notes: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    /** When set, upserts company-level parsed cache (one parse at upload). */
    parsed: v.optional(dctParsedToolDocumentInValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) {
      throw new Error("Project has no company; attach the project to a company to store DCT library files.");
    }
    const companyId = project.companyId as Id<"companies">;
    const sharedRefId = await ctx.db.insert("sharedReferenceDocuments", {
      documentType: "faa_sas_dct",
      canonicalDocType: "faa_sas_dct",
      name: args.name,
      path: args.path,
      source: "project_upload",
      issuer: "FAA SAS DCT",
      mimeType: args.mimeType ?? "application/xml",
      storageId: args.storageId,
      contentHash: args.contentHash,
      companyId,
      notes: args.notes,
      addedAt: new Date().toISOString(),
      addedBy: userId,
    });

    if (args.parsed) {
      const ch = String(args.parsed.contentHash ?? "").trim();
      if (!ch) {
        throw new Error("parsed.contentHash is required when passing parsed payload");
      }
      if (args.contentHash && String(args.contentHash).trim() !== ch) {
        throw new Error("contentHash must match parsed.contentHash");
      }
      const now = new Date().toISOString();
      const existing = await ctx.db
        .query("dctParsedLibraryDocuments")
        .withIndex("by_companyId_hash", (q: any) =>
          q.eq("companyId", companyId).eq("contentHash", ch),
        )
        .first();
      if (!existing) {
        await ctx.db.insert("dctParsedLibraryDocuments", {
          companyId,
          contentHash: ch,
          fileName: args.parsed.fileName,
          standardDctId: args.parsed.standardDctId,
          standardDctDetailId: args.parsed.standardDctDetailId,
          dctVersionNumber: args.parsed.dctVersionNumber,
          dctVersionDate: args.parsed.dctVersionDate,
          dctStatus: args.parsed.dctStatus,
          mlfId: args.parsed.mlfId,
          mlfLabel: args.parsed.mlfLabel,
          mlfName: args.parsed.mlfName,
          assessmentTypeLabel: args.parsed.assessmentTypeLabel,
          specialtyLabel: args.parsed.specialtyLabel,
          peerGroupLabel: args.parsed.peerGroupLabel,
          purpose: args.parsed.purpose,
          objective: args.parsed.objective,
          questionCount: args.parsed.questions.length,
          sourceSharedReferenceDocumentId: sharedRefId,
          createdAt: now,
          updatedAt: now,
        });
        for (const q of args.parsed.questions) {
          await ctx.db.insert("dctParsedLibraryQuestions", {
            companyId,
            contentHash: ch,
            questionId: q.questionId,
            questionDetailsId: q.questionDetailsId,
            qVersionNumber: q.qVersionNumber,
            qVersionDate: q.qVersionDate,
            displayOrder: q.displayOrder,
            text: q.text,
            safetyAttribute: q.safetyAttribute,
            questionType: q.questionType,
            scopingAttribute: q.scopingAttribute,
            noteToUser: q.noteToUser,
            references: q.references?.length ? q.references : undefined,
            responses: q.responses?.length ? q.responses : undefined,
            createdAt: now,
            updatedAt: now,
          });
        }
      } else {
        const patch: Record<string, unknown> = { updatedAt: now };
        if (!existing.sourceSharedReferenceDocumentId) {
          patch.sourceSharedReferenceDocumentId = sharedRefId;
        }
        await ctx.db.patch(existing._id, patch as any);
      }
    }

    return sharedRefId;
  },
});

export const remove = mutation({
  args: { documentId: v.id("sharedReferenceDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireRemoveSharedRef(ctx, doc);
    if (doc.storageId) await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(args.documentId);
  },
});

export const clearByType = mutation({
  args: {
    documentType: v.string(),
    /** Omit to clear only platform-wide rows for this type (admin). */
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (args.companyId !== undefined) {
      await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
      const typed = await ctx.db
        .query("sharedReferenceDocuments")
        .withIndex("by_documentType", (q) => q.eq("documentType", args.documentType))
        .collect();
      const docs = typed.filter((d: any) => d.companyId === args.companyId);
      for (const doc of docs) {
        if (doc.storageId) await ctx.storage.delete(doc.storageId);
        await ctx.db.delete(doc._id);
      }
      return;
    }
    await requirePlatformStaff(ctx);
    const typed = await ctx.db
      .query("sharedReferenceDocuments")
      .withIndex("by_documentType", (q) => q.eq("documentType", args.documentType))
      .collect();
    const docs = typed.filter((d: any) => d.companyId === undefined);
    for (const doc of docs) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }
  },
});

/**
 * Project members may bulk-delete DCT XML shared refs for their company, mirroring
 * addDctXmlFromProject's auth. Restricted to documentType faa_sas_dct.
 */
export const clearDctXmlFromProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) {
      throw new Error("Project has no company; attach the project to a company to manage DCT library files.");
    }
    const companyId = project.companyId as Id<"companies">;
    const typed = await ctx.db
      .query("sharedReferenceDocuments")
      .withIndex("by_documentType", (q) => q.eq("documentType", "faa_sas_dct"))
      .collect();
    const docs = typed.filter((d: any) => d.companyId === companyId);
    for (const doc of docs) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }
    return docs.length;
  },
});
