import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireLogbookEnabled, requireProjectOwner } from "./_helpers";

function isLogbookDisabledError(error: unknown): boolean {
  return error instanceof Error && error.message === "Logbook module disabled";
}

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
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
    extractedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
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
      extractedAt: args.extractedAt,
    });
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectOwner(ctx, doc.projectId);
    if (doc.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    if (doc.storageId) {
      await ctx.storage.delete(doc.storageId);
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
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectOwner(ctx, doc.projectId);
    if (doc.category === "logbook") {
      await requireLogbookEnabled(ctx);
    }
    await ctx.db.patch(args.documentId, {
      extractedText: args.extractedText,
      extractedAt: args.extractedAt,
      mimeType: args.mimeType ?? doc.mimeType,
      size: args.size ?? doc.size,
      extractionMeta: args.extractionMeta ?? (doc as any).extractionMeta,
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
    await requireProjectOwner(ctx, args.projectId);
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
      await ctx.db.delete(doc._id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
  },
});
