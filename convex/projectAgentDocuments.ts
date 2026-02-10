import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProjectAndAgent = query({
  args: {
    projectId: v.id("projects"),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("projectAgentDocuments")
      .withIndex("by_projectId_agentId", (q) =>
        q.eq("projectId", args.projectId).eq("agentId", args.agentId)
      )
      .collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("projectAgentDocuments")
      .withIndex("by_projectId_agentId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    agentId: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    extractedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    return await ctx.db.insert("projectAgentDocuments", {
      projectId: args.projectId,
      userId,
      agentId: args.agentId,
      name: args.name,
      path: args.path,
      source: args.source,
      mimeType: args.mimeType,
      extractedText: args.extractedText,
      storageId: args.storageId,
      extractedAt: args.extractedAt,
    });
  },
});

export const remove = mutation({
  args: { documentId: v.id("projectAgentDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireProjectOwner(ctx, doc.projectId);
    if (doc.storageId) {
      await ctx.storage.delete(doc.storageId);
    }
    await ctx.db.delete(args.documentId);
  },
});

export const clear = mutation({
  args: {
    projectId: v.id("projects"),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const docs = await ctx.db
      .query("projectAgentDocuments")
      .withIndex("by_projectId_agentId", (q) =>
        q.eq("projectId", args.projectId).eq("agentId", args.agentId)
      )
      .collect();
    for (const doc of docs) {
      if (doc.storageId) {
        await ctx.storage.delete(doc.storageId);
      }
      await ctx.db.delete(doc._id);
    }
  },
});
