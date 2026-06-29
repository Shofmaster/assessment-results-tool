import { action, query, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireLogbookEnabled, requireProjectAccess, requireCompanyOrDelegatedSupportAccess, isLocalReferenceCategory, isStandardsReferenceCategory } from "./_helpers";
import { normalizeText } from "./_textUtils";

function isLogbookDisabledError(error: unknown): boolean {
  return error instanceof Error && error.message === "Logbook module disabled";
}

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    if (args.category) {
      if (args.category === "logbook") {
        await requireLogbookEnabled(ctx);
      }
      return await ctx.db
        .query("documents")
        .withIndex("by_projectId_category", (q) =>
          q.eq("projectId", args.projectId).eq("category", args.category!)
        )
        .collect();
    }
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    try {
      await requireLogbookEnabled(ctx);
      return docs;
    } catch (error) {
      if (isLogbookDisabledError(error)) {
        return docs.filter((doc) => doc.category !== "logbook");
      }
      throw error;
    }
  },
});

export const listByProjectAndFolder = query({
  args: {
    projectId: v.id("projects"),
    category: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    let docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (args.category) docs = docs.filter((doc) => doc.category === args.category);
    if (args.folderId !== undefined) {
      docs = args.folderId === null ? docs.filter((doc) => !doc.folderId) : docs.filter((doc) => doc.folderId === args.folderId);
    }
    return docs;
  },
});

export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    let logbookAllowed = true;
    if (!args.category || args.category !== "logbook") {
      try {
        await requireLogbookEnabled(ctx);
      } catch (error) {
        if (isLogbookDisabledError(error)) {
          logbookAllowed = false;
        } else {
          throw error;
        }
      }
    }

    const out: Array<Doc<"documents"> & { projectName: string }> = [];

    for (const project of projects) {
      let docs;
      if (args.category) {
        if (args.category === "logbook") {
          await requireLogbookEnabled(ctx);
        }
        docs = await ctx.db
          .query("documents")
          .withIndex("by_projectId_category", (q) =>
            q.eq("projectId", project._id).eq("category", args.category!),
          )
          .collect();
      } else {
        docs = await ctx.db
          .query("documents")
          .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
          .collect();
        if (!logbookAllowed) {
          docs = docs.filter((doc) => doc.category !== "logbook");
        }
      }
      for (const doc of docs) {
        out.push({ ...doc, projectName: project.name });
      }
    }
    return out;
  },
});

export const get = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    await requireProjectAccess(ctx, doc.projectId);
    return doc;
  },
});

/** Download URL for the original binary (any project member with document access). */
export const getFileUrl = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.storageId) return null;
    await requireProjectAccess(ctx, doc.projectId);
    return await ctx.storage.getUrl(doc.storageId);
  },
});

export const getExtractedTextOverflowUrl = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.extractedTextStorageId) return null;
    await requireProjectAccess(ctx, doc.projectId);
    return await ctx.storage.getUrl(doc.extractedTextStorageId);
  },
});

const TEXT_SLICE_DEFAULT_PADDING = 1500;
const TEXT_SLICE_MAX_PADDING = 4000;

/**
 * Resolve a cited chunk span back into highlightable text: the span itself plus
 * surrounding context. Offsets are interpreted against the SAME normalized text
 * that documentChunks.indexDocument chunked (see _textUtils.normalizeText), so a
 * chunk's stored startChar/endChar highlight exactly the indexed passage.
 * Action (not query) because overflow text lives in storage and must be fetched.
 */
export const getTextSlice = action({
  args: {
    documentId: v.id("documents"),
    startChar: v.number(),
    endChar: v.number(),
    padding: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    docName: string;
    category: string;
    before: string;
    span: string;
    after: string;
    sliceStart: number;
    sliceEnd: number;
    textLength: number;
  } | null> => {
    // api.documents.get enforces project access for the caller.
    const doc = await ctx.runQuery(api.documents.get, { documentId: args.documentId });
    if (!doc) return null;

    let fullText = (doc.extractedText || "").trim();
    if (doc.extractedTextStorageId) {
      try {
        const url = await ctx.storage.getUrl(doc.extractedTextStorageId);
        if (url) {
          const response = await fetch(url);
          if (response.ok) {
            const storageText = (await response.text()).trim();
            if (storageText) fullText = storageText;
          }
        }
      } catch {
        // Fall back to inline text.
      }
    }
    const text = normalizeText(fullText);
    if (!text) return null;

    const padding = Math.max(0, Math.min(args.padding ?? TEXT_SLICE_DEFAULT_PADDING, TEXT_SLICE_MAX_PADDING));
    const start = Math.max(0, Math.min(Math.floor(args.startChar), text.length));
    const end = Math.max(start, Math.min(Math.floor(args.endChar), text.length));
    const sliceStart = Math.max(0, start - padding);
    const sliceEnd = Math.min(text.length, end + padding);

    return {
      docName: doc.name,
      category: doc.category,
      before: text.slice(sliceStart, start),
      span: text.slice(start, end),
      after: text.slice(end, sliceEnd),
      sliceStart,
      sliceEnd,
      textLength: text.length,
    };
  },
});

export const findByContentHash = query({
  args: {
    projectId: v.id("projects"),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_projectId_contentHash", (q) =>
        q.eq("projectId", args.projectId).eq("contentHash", args.contentHash),
      )
      .first();
    return existing ? { documentId: existing._id, name: existing.name } : null;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    folderId: v.optional(v.id("libraryFolders")),
    category: v.string(),
    documentType: v.optional(v.string()),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    extractedText: v.optional(v.string()),
    extractionMeta: v.optional(v.object({
      backend: v.string(),
      confidence: v.optional(v.number()),
    })),
    storageId: v.optional(v.id("_storage")),
    extractedTextStorageId: v.optional(v.id("_storage")),
    contentHash: v.optional(v.string()),
    documentSourceId: v.optional(v.id("documentSources")),
    extractedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    if (args.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    // Copyrighted material (manufacturer manuals + compliance standards) is referenced
    // from a customer source — never persist a copy. Strip any text/bytes the client
    // may have sent and drop blobs. Exception: a company an AeroGap admin has explicitly
    // opted in (allowManufacturerDocStorage for manuals; allowStandardsStorage for
    // standards) stores full copies as before.
    const localRef = isLocalReferenceCategory(args.category);
    if (localRef) {
      const project = await ctx.db.get(args.projectId);
      const companyId = project?.companyId;
      const policy = companyId
        ? await ctx.db
            .query("companyFeaturePolicies")
            .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
            .unique()
        : null;
      const storageEnabled = isStandardsReferenceCategory(args.category)
        ? policy?.allowStandardsStorage === true
        : policy?.allowManufacturerDocStorage === true;
      if (!storageEnabled) {
        if (args.storageId) await ctx.storage.delete(args.storageId);
        if (args.extractedTextStorageId) await ctx.storage.delete(args.extractedTextStorageId);
        args.extractedText = undefined;
        args.extractionMeta = undefined;
        args.storageId = undefined;
        args.extractedTextStorageId = undefined;
      }
    }
    if (args.folderId) {
      const project = await ctx.db.get(args.projectId);
      const folder = await ctx.db.get(args.folderId);
      if (!project?.companyId || !folder || folder.companyId !== project.companyId) {
        throw new Error("Folder does not belong to this document's company");
      }
    }
    if (args.contentHash) {
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_projectId_contentHash", (q) =>
          q.eq("projectId", args.projectId).eq("contentHash", args.contentHash!),
        )
        .first();
      if (existing) {
        // Duplicate content already stored for this project. The caller uploaded
        // its blobs to storage before calling add(); since we're reusing the
        // existing row, those uploads are orphaned — delete them so dedup doesn't
        // leak storage. (Skip any blob the existing row happens to reference.)
        if (args.storageId && args.storageId !== existing.storageId) {
          await ctx.storage.delete(args.storageId);
        }
        if (
          args.extractedTextStorageId &&
          args.extractedTextStorageId !== existing.extractedTextStorageId
        ) {
          await ctx.storage.delete(args.extractedTextStorageId);
        }
        return existing._id;
      }
    }
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    const documentId = await ctx.db.insert("documents", {
      projectId: args.projectId,
      userId,
      folderId: args.folderId,
      category: args.category,
      documentType: args.documentType,
      name: args.name,
      path: args.path,
      source: args.source,
      mimeType: args.mimeType,
      size: args.size,
      extractedText: args.extractedText,
      extractionMeta: args.extractionMeta,
      storageId: args.storageId,
      extractedTextStorageId: args.extractedTextStorageId,
      contentHash: args.contentHash,
      documentSourceId: args.documentSourceId,
      extractedAt: args.extractedAt,
    });
    if (args.extractedText?.trim().length || args.extractedTextStorageId) {
      await ctx.scheduler.runAfter(0, internal.documentChunks.indexDocument, { documentId });
    }
    return documentId;
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectAccess(ctx, doc.projectId);
    if (doc.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    if (doc.storageId) {
      await ctx.storage.delete(doc.storageId);
    }
    if (doc.extractedTextStorageId) {
      await ctx.storage.delete(doc.extractedTextStorageId);
    }
    await ctx.scheduler.runAfter(0, internal.documentChunks.clearForDocument, { documentId: args.documentId });
    await ctx.db.delete(args.documentId);
    await ctx.db.patch(doc.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const updateExtractedText = mutation({
  args: {
    documentId: v.id("documents"),
    extractedText: v.string(),
    extractedAt: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    extractionMeta: v.optional(v.object({
      backend: v.string(),
      confidence: v.optional(v.number()),
    })),
    extractedTextStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectAccess(ctx, doc.projectId);
    if (isLocalReferenceCategory(doc.category)) {
      throw new Error("Cannot store extracted text for manufacturer-reference documents (referenced from source).");
    }
    if (doc.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    const prevOverflow = doc.extractedTextStorageId;
    const patch: Record<string, unknown> = {
      extractedText: args.extractedText,
      extractedAt: args.extractedAt,
      mimeType: args.mimeType ?? doc.mimeType,
      size: args.size ?? doc.size,
      extractionMeta: args.extractionMeta ?? (doc as any).extractionMeta,
    };
    if (args.extractedTextStorageId !== undefined) {
      if (args.extractedTextStorageId === null) {
        if (prevOverflow) await ctx.storage.delete(prevOverflow);
        patch.extractedTextStorageId = undefined;
      } else {
        if (prevOverflow && prevOverflow !== args.extractedTextStorageId) {
          await ctx.storage.delete(prevOverflow);
        }
        patch.extractedTextStorageId = args.extractedTextStorageId;
      }
    }
    await ctx.db.patch(args.documentId, patch as any);
    await ctx.db.patch(doc.projectId, { updatedAt: new Date().toISOString() });
    await ctx.scheduler.runAfter(0, internal.documentChunks.indexDocument, { documentId: args.documentId });
    return args.documentId;
  },
});

/** Attach or replace the original binary file in storage (e.g. retry after failed upload). */
export const updateBinaryStorage = mutation({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectAccess(ctx, doc.projectId);
    if (isLocalReferenceCategory(doc.category)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Cannot store binary for manufacturer-reference documents (referenced from source).");
    }
    if (doc.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    const prev = doc.storageId;
    if (prev && prev !== args.storageId) {
      await ctx.storage.delete(prev);
    }
    await ctx.db.patch(args.documentId, { storageId: args.storageId });
    await ctx.db.patch(doc.projectId, { updatedAt: new Date().toISOString() });
    return args.documentId;
  },
});

export const updateCategory = mutation({
  args: {
    documentId: v.id("documents"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectAccess(ctx, doc.projectId);
    if (doc.category === "logbook" || args.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    if (doc.category === args.category) return args.documentId;
    // Reclassifying into a manufacturer-reference category: purge any persisted copy.
    if (isLocalReferenceCategory(args.category)) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      if (doc.extractedTextStorageId) await ctx.storage.delete(doc.extractedTextStorageId);
      await ctx.scheduler.runAfter(0, internal.documentChunks.clearForDocument, { documentId: args.documentId });
      await ctx.db.patch(args.documentId, {
        category: args.category,
        extractedText: undefined,
        extractionMeta: undefined,
        storageId: undefined,
        extractedTextStorageId: undefined,
      });
      await ctx.db.patch(doc.projectId, { updatedAt: new Date().toISOString() });
      return args.documentId;
    }
    await ctx.db.patch(args.documentId, { category: args.category });
    await ctx.db.patch(doc.projectId, { updatedAt: new Date().toISOString() });
    await ctx.scheduler.runAfter(0, internal.documentChunks.indexDocument, {
      documentId: args.documentId,
    });
    return args.documentId;
  },
});

export const moveToFolder = mutation({
  args: {
    documentId: v.id("documents"),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectAccess(ctx, doc.projectId);
    if (args.folderId !== undefined && args.folderId !== null) {
      const project = await ctx.db.get(doc.projectId);
      const folder = await ctx.db.get(args.folderId);
      if (!project?.companyId || !folder || folder.companyId !== project.companyId) {
        throw new Error("Folder does not belong to this document's company");
      }
    }
    await ctx.db.patch(args.documentId, {
      folderId: args.folderId === null ? undefined : args.folderId,
    });
    await ctx.db.patch(doc.projectId, { updatedAt: new Date().toISOString() });
    return args.documentId;
  },
});

export const clear = mutation({
  args: {
    projectId: v.id("projects"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    if (args.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId_category", (q) =>
        q.eq("projectId", args.projectId).eq("category", args.category)
      )
      .collect();
    for (const doc of docs) {
      if (doc.storageId) {
        await ctx.storage.delete(doc.storageId);
      }
      if (doc.extractedTextStorageId) {
        await ctx.storage.delete(doc.extractedTextStorageId);
      }
      await ctx.scheduler.runAfter(0, internal.documentChunks.clearForDocument, { documentId: doc._id });
      await ctx.db.delete(doc._id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
  },
});
