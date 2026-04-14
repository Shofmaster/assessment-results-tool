import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireLogbookEnabled, requireProjectAccess, requireCompanyOrDelegatedSupportAccess } from "./_helpers";

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

export const getExtractedTextOverflowUrl = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.extractedTextStorageId) return null;
    await requireProjectAccess(ctx, doc.projectId);
    return await ctx.storage.getUrl(doc.extractedTextStorageId);
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    category: v.string(),
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
    extractedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    if (args.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("documents", {
      projectId: args.projectId,
      userId,
      category: args.category,
      name: args.name,
      path: args.path,
      source: args.source,
      mimeType: args.mimeType,
      size: args.size,
      extractedText: args.extractedText,
      extractionMeta: args.extractionMeta,
      storageId: args.storageId,
      extractedTextStorageId: args.extractedTextStorageId,
      extractedAt: args.extractedAt,
    });
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
      await ctx.db.delete(doc._id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
  },
});
