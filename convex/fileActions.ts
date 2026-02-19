import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./_helpers";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getSharedReferenceDocumentFileUrl = query({
  args: { documentId: v.id("sharedReferenceDocuments") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.storageId) return null;
    return await ctx.storage.getUrl(doc.storageId);
  },
});

export const getSharedAgentDocumentFileUrl = query({
  args: { documentId: v.id("sharedAgentDocuments") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.storageId) return null;
    return await ctx.storage.getUrl(doc.storageId);
  },
});
