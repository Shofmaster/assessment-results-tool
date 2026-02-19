import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdmin } from "./_helpers";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("sharedReferenceDocuments").collect();
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
  args: { documentType: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("sharedReferenceDocuments")
      .withIndex("by_documentType", (q) => q.eq("documentType", args.documentType))
      .collect();
  },
});

export const add = mutation({
  args: {
    documentType: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAdmin(ctx);
    return await ctx.db.insert("sharedReferenceDocuments", {
      documentType: args.documentType,
      name: args.name,
      path: args.path,
      source: args.source,
      mimeType: args.mimeType,
      extractedText: args.extractedText,
      storageId: args.storageId,
      addedAt: new Date().toISOString(),
      addedBy: userId,
    });
  },
});

export const remove = mutation({
  args: { documentId: v.id("sharedReferenceDocuments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (doc.storageId) await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(args.documentId);
  },
});

export const clearByType = mutation({
  args: { documentType: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const docs = await ctx.db
      .query("sharedReferenceDocuments")
      .withIndex("by_documentType", (q) => q.eq("documentType", args.documentType))
      .collect();
    for (const doc of docs) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }
  },
});
