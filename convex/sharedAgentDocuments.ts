import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuth, requireAdmin } from "./_helpers";

export const listByAgent = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("sharedAgentDocuments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

export const listByAgents = query({
  args: { agentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.agentIds.length === 0) return [];
    const all: Doc<"sharedAgentDocuments">[] = [];
    for (const agentId of args.agentIds) {
      const docs = await ctx.db
        .query("sharedAgentDocuments")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .collect();
      all.push(...docs);
    }
    return all;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("sharedAgentDocuments").collect();
  },
});

export const add = mutation({
  args: {
    agentId: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAdmin(ctx);
    return await ctx.db.insert("sharedAgentDocuments", {
      agentId: args.agentId,
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
  args: { documentId: v.id("sharedAgentDocuments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (doc.storageId) {
      await ctx.storage.delete(doc.storageId);
    }
    await ctx.db.delete(args.documentId);
  },
});

export const clearByAgent = mutation({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const docs = await ctx.db
      .query("sharedAgentDocuments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
    for (const doc of docs) {
      if (doc.storageId) {
        await ctx.storage.delete(doc.storageId);
      }
      await ctx.db.delete(doc._id);
    }
  },
});
