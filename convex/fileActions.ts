import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  requireAuth,
  requireProjectAccess,
  requireCompanyOrDelegatedSupportAccess,
} from "./_helpers";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Delete an orphaned storage blob after a failed project upload.
 * Requires project access and refuses if any document in that project still
 * references the blob — closes the prior auth-only IDOR on raw storage ids.
 * Raw getFileUrl(storageId) was removed; use document-scoped URL queries instead.
 */
export const deleteStorage = mutation({
  args: {
    storageId: v.id("_storage"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const sid = String(args.storageId);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const doc of documents) {
      if (String(doc.storageId) === sid || String(doc.extractedTextStorageId) === sid) {
        throw new Error("Not authorized: storage blob is still referenced");
      }
    }

    const projectAgentDocs = await ctx.db
      .query("projectAgentDocuments")
      .withIndex("by_projectId_agentId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const doc of projectAgentDocs) {
      if (String(doc.storageId) === sid) {
        throw new Error("Not authorized: storage blob is still referenced");
      }
    }

    await ctx.storage.delete(args.storageId);
  },
});

export const getSharedReferenceDocumentFileUrl = query({
  args: { documentId: v.id("sharedReferenceDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.storageId) return null;
    if (doc.companyId) {
      await requireCompanyOrDelegatedSupportAccess(ctx, doc.companyId);
    } else {
      await requireAuth(ctx);
    }
    return await ctx.storage.getUrl(doc.storageId);
  },
});

/** One round-trip for many shared reference download URLs (same auth rules as single lookup). */
export const getSharedReferenceDocumentFileUrlsBatch = query({
  args: { documentIds: v.array(v.id("sharedReferenceDocuments")) },
  handler: async (ctx, { documentIds }) => {
    const seen = new Set<string>();
    const unique: Id<"sharedReferenceDocuments">[] = [];
    for (const id of documentIds) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(id);
    }

    const rows = await Promise.all(unique.map((id) => ctx.db.get(id)));

    const companyIds = new Set<Id<"companies">>();
    let anyGlobal = false;
    for (const doc of rows) {
      if (!doc) continue;
      if (doc.companyId) companyIds.add(doc.companyId);
      else anyGlobal = true;
    }
    for (const cid of companyIds) {
      await requireCompanyOrDelegatedSupportAccess(ctx, cid);
    }
    if (anyGlobal) {
      await requireAuth(ctx);
    }

    const out: Array<{ documentId: Id<"sharedReferenceDocuments">; url: string | null }> = [];
    for (let i = 0; i < unique.length; i++) {
      const id = unique[i];
      const doc = rows[i];
      if (!doc?.storageId) {
        out.push({ documentId: id, url: null });
        continue;
      }
      out.push({ documentId: id, url: await ctx.storage.getUrl(doc.storageId) });
    }
    return out;
  },
});

export const getSharedAgentDocumentFileUrl = query({
  args: { documentId: v.id("sharedAgentDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc?.storageId) return null;
    if (doc.companyId) {
      await requireCompanyOrDelegatedSupportAccess(ctx, doc.companyId);
    } else {
      await requireAuth(ctx);
    }
    return await ctx.storage.getUrl(doc.storageId);
  },
});

export const getProjectDocumentFileUrl = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    await requireProjectAccess(ctx, doc.projectId);
    if (!doc.storageId) return null;
    return await ctx.storage.getUrl(doc.storageId);
  },
});
