import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
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

/** Delete blob if present; never block row removal on storage failures. */
async function deleteSharedRefStorageBestEffort(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
): Promise<void> {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch (err) {
    console.error(
      "[sharedReferenceDocuments] storage.delete failed; continuing",
      storageId,
      err,
    );
  }
}

function dedupeHashes(hashes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hashes) {
    const t = String(h ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

const DCT_BULK_DOCS_PER_CHUNK = 25;
const DCT_BULK_QUESTION_DELETE_BUDGET = 450;

/** Insert job row + schedule first chunk (shared by startDctBulkDeleteJob and clearDctXmlFromProject). */
async function beginDctBulkDeleteJobForProject(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    requestedBy: string;
    totalEstimate?: number;
  },
): Promise<Id<"dctBulkDeleteJobs">> {
  const project = await ctx.db.get(args.projectId);
  if (!project?.companyId) {
    throw new Error("Project has no company; attach the project to a company to manage DCT library files.");
  }
  const companyId = project.companyId as Id<"companies">;
  const recent = await ctx.db
    .query("dctBulkDeleteJobs")
    .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
    .order("desc")
    .take(8);
  for (const j of recent) {
    if (j.status === "queued" || j.status === "running") {
      throw new Error(
        "A DCT bulk delete is already in progress for this project. Wait for it to finish or refresh the page.",
      );
    }
  }
  const now = new Date().toISOString();
  const jobId = await ctx.db.insert("dctBulkDeleteJobs", {
    projectId: args.projectId,
    companyId,
    requestedBy: args.requestedBy,
    status: "queued",
    totalEstimate: args.totalEstimate,
    deletedDocs: 0,
    deletedParsedDocs: 0,
    deletedParsedQuestions: 0,
    pendingContentHashes: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.sharedReferenceDocuments.runDctBulkDeleteChunk, {
    jobId,
  });
  return jobId;
}

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
 * If there are more than {@link DCT_BULK_DOCS_PER_CHUNK} files, starts the same background job as
 * startDctBulkDeleteJob (returns `{ kind: "job", jobId }`); otherwise deletes synchronously
 * (`{ kind: "sync", deleted }`) without parsed-cache cleanup (legacy small-batch path).
 */
export const clearDctXmlFromProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) {
      throw new Error("Project has no company; attach the project to a company to manage DCT library files.");
    }
    const companyId = project.companyId as Id<"companies">;
    const docs = await ctx.db
      .query("sharedReferenceDocuments")
      .withIndex("by_companyId_documentType", (q) =>
        q.eq("companyId", companyId).eq("documentType", "faa_sas_dct"),
      )
      .take(DCT_BULK_DOCS_PER_CHUNK + 1);
    if (docs.length > DCT_BULK_DOCS_PER_CHUNK) {
      const jobId = await beginDctBulkDeleteJobForProject(ctx, {
        projectId: args.projectId,
        requestedBy: userId,
      });
      return { kind: "job" as const, jobId };
    }
    for (const doc of docs) {
      await deleteSharedRefStorageBestEffort(ctx, doc.storageId);
      await ctx.db.delete(doc._id);
    }
    return { kind: "sync" as const, deleted: docs.length };
  },
});

/** Start a background job to delete all DCT XML shared refs + parsed library cache for the project's company. */
export const startDctBulkDeleteJob = mutation({
  args: {
    projectId: v.id("projects"),
    /** Optional count from UI for progress display (e.g. dctLibraryRefs.length). */
    totalEstimate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    return await beginDctBulkDeleteJobForProject(ctx, {
      projectId: args.projectId,
      requestedBy: userId,
      totalEstimate: args.totalEstimate,
    });
  },
});

export const getDctBulkDeleteJob = query({
  args: { jobId: v.id("dctBulkDeleteJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await requireProjectAccess(ctx, job.projectId);
    return job;
  },
});

/** Latest non-terminal bulk-delete job for this project (for resume after refresh). */
export const getActiveDctBulkDeleteJobForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = await ctx.db
      .query("dctBulkDeleteJobs")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(12);
    for (const j of rows) {
      if (j.status === "queued" || j.status === "running") return j;
    }
    return null;
  },
});

export const runDctBulkDeleteChunk = internalMutation({
  args: { jobId: v.id("dctBulkDeleteJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
      return;
    }

    const now = new Date().toISOString();
    const companyId = job.companyId;

    try {
      if (job.status === "queued") {
        await ctx.db.patch(args.jobId, { status: "running", updatedAt: now });
      }

      let pending = dedupeHashes([...job.pendingContentHashes]);
      let deletedDocs = job.deletedDocs;
      let deletedParsedDocs = job.deletedParsedDocs;
      let deletedParsedQuestions = job.deletedParsedQuestions;
      let qBudget = DCT_BULK_QUESTION_DELETE_BUDGET;

      while (pending.length > 0 && qBudget > 0) {
        const h = pending[0]!;
        const takeN = Math.min(80, qBudget);
        const batch = await ctx.db
          .query("dctParsedLibraryQuestions")
          .withIndex("by_companyId_hash", (q) =>
            q.eq("companyId", companyId).eq("contentHash", h),
          )
          .take(takeN);

        if (batch.length === 0) {
          const docRow = await ctx.db
            .query("dctParsedLibraryDocuments")
            .withIndex("by_companyId_hash", (q) =>
              q.eq("companyId", companyId).eq("contentHash", h),
            )
            .first();
          if (docRow) {
            await ctx.db.delete(docRow._id);
            deletedParsedDocs++;
          }
          pending.shift();
          continue;
        }

        for (const row of batch) {
          await ctx.db.delete(row._id);
          deletedParsedQuestions++;
          qBudget--;
        }
      }

      const docs = await ctx.db
        .query("sharedReferenceDocuments")
        .withIndex("by_companyId_documentType", (q) =>
          q.eq("companyId", companyId).eq("documentType", "faa_sas_dct"),
        )
        .take(DCT_BULK_DOCS_PER_CHUNK);

      const newHashes: string[] = [];
      for (const doc of docs) {
        await deleteSharedRefStorageBestEffort(ctx, doc.storageId);
        await ctx.db.delete(doc._id);
        deletedDocs++;
        const ch = String((doc as any).contentHash ?? "").trim();
        if (ch) newHashes.push(ch);
      }
      pending = dedupeHashes([...pending, ...newHashes]);

      const hasMoreWork =
        pending.length > 0 || docs.length === DCT_BULK_DOCS_PER_CHUNK;

      const doneAt = new Date().toISOString();
      await ctx.db.patch(args.jobId, {
        pendingContentHashes: pending,
        deletedDocs,
        deletedParsedDocs,
        deletedParsedQuestions,
        updatedAt: doneAt,
        ...(hasMoreWork ? {} : { status: "completed" as const }),
      });

      if (hasMoreWork) {
        await ctx.scheduler.runAfter(0, internal.sharedReferenceDocuments.runDctBulkDeleteChunk, {
          jobId: args.jobId,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.db.patch(args.jobId, {
        status: "failed",
        lastError: msg,
        updatedAt: new Date().toISOString(),
      });
      console.error("[dctBulkDelete] chunk failed", args.jobId, err);
    }
  },
});
