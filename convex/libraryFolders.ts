import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCompanyOrDelegatedSupportAccess } from "./_helpers";

async function getFolderOrThrow(ctx: { db: any }, folderId: Id<"libraryFolders">) {
  const folder = await ctx.db.get(folderId);
  if (!folder) throw new Error("Folder not found");
  return folder as Doc<"libraryFolders">;
}

function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function assertUniqueSiblingName(
  ctx: { db: any },
  companyId: Id<"companies">,
  parentFolderId: Id<"libraryFolders"> | undefined,
  name: string,
  ignoreFolderId?: Id<"libraryFolders">,
) {
  const normalized = normalizeFolderName(name);
  const siblings = await ctx.db
    .query("libraryFolders")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .collect();
  const conflict = siblings.find((row: Doc<"libraryFolders">) => {
    if (ignoreFolderId && row._id === ignoreFolderId) return false;
    return row.parentFolderId === parentFolderId && normalizeFolderName(row.name) === normalized;
  });
  if (conflict) throw new Error("A folder with this name already exists in this location");
}

async function assertFolderInCompany(
  ctx: { db: any },
  folderId: Id<"libraryFolders"> | undefined,
  companyId: Id<"companies">,
) {
  if (!folderId) return;
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.companyId !== companyId) {
    throw new Error("Folder does not belong to this company");
  }
}

async function collectDescendantFolderIds(
  ctx: { db: any },
  companyId: Id<"companies">,
  rootFolderId: Id<"libraryFolders">,
) {
  const all = (await ctx.db
    .query("libraryFolders")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .collect()) as Doc<"libraryFolders">[];
  const childrenByParent = new Map<string, Doc<"libraryFolders">[]>();
  for (const folder of all) {
    const key = folder.parentFolderId ? String(folder.parentFolderId) : "__root__";
    const group = childrenByParent.get(key) ?? [];
    group.push(folder);
    childrenByParent.set(key, group);
  }

  const out: Id<"libraryFolders">[] = [];
  const stack: Id<"libraryFolders">[] = [rootFolderId];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current);
    const children = childrenByParent.get(String(current)) ?? [];
    for (const child of children) stack.push(child._id);
  }
  return out;
}

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const rows = await ctx.db
      .query("libraryFolders")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    rows.sort((a, b) => {
      const aSort = a.sortOrder ?? 0;
      const bSort = b.sortOrder ?? 0;
      if (aSort !== bSort) return aSort - bSort;
      return a.name.localeCompare(b.name);
    });
    return rows;
  },
});

export const create = mutation({
  args: {
    companyId: v.id("companies"),
    parentFolderId: v.optional(v.id("libraryFolders")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Folder name is required");
    await assertFolderInCompany(ctx, args.parentFolderId, args.companyId);
    await assertUniqueSiblingName(ctx, args.companyId, args.parentFolderId, trimmed);
    const now = new Date().toISOString();
    return await ctx.db.insert("libraryFolders", {
      companyId: args.companyId,
      parentFolderId: args.parentFolderId,
      name: trimmed,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: {
    folderId: v.id("libraryFolders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const folder = await getFolderOrThrow(ctx, args.folderId);
    await requireCompanyOrDelegatedSupportAccess(ctx, folder.companyId);
    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Folder name is required");
    await assertUniqueSiblingName(ctx, folder.companyId, folder.parentFolderId, trimmed, folder._id);
    await ctx.db.patch(folder._id, { name: trimmed, updatedAt: new Date().toISOString() });
    return folder._id;
  },
});

export const move = mutation({
  args: {
    folderId: v.id("libraryFolders"),
    newParentFolderId: v.optional(v.id("libraryFolders")),
  },
  handler: async (ctx, args) => {
    const folder = await getFolderOrThrow(ctx, args.folderId);
    await requireCompanyOrDelegatedSupportAccess(ctx, folder.companyId);
    if (args.newParentFolderId === folder._id) throw new Error("Folder cannot be moved into itself");
    await assertFolderInCompany(ctx, args.newParentFolderId, folder.companyId);
    if (args.newParentFolderId) {
      let cursor: Id<"libraryFolders"> | undefined = args.newParentFolderId;
      while (cursor) {
        if (cursor === folder._id) throw new Error("Folder cannot be moved into its descendant");
        const current: Doc<"libraryFolders"> | null = await ctx.db.get(cursor);
        cursor = current?.parentFolderId;
      }
    }
    await assertUniqueSiblingName(ctx, folder.companyId, args.newParentFolderId, folder.name, folder._id);
    const now = new Date().toISOString();
    await ctx.db.patch(folder._id, { parentFolderId: args.newParentFolderId, updatedAt: now });
    return folder._id;
  },
});

export const remove = mutation({
  args: {
    folderId: v.id("libraryFolders"),
    mode: v.optional(v.union(v.literal("moveChildrenUp"), v.literal("deleteAll"))),
  },
  handler: async (ctx, args) => {
    const mode = args.mode ?? "moveChildrenUp";
    const folder = await getFolderOrThrow(ctx, args.folderId);
    await requireCompanyOrDelegatedSupportAccess(ctx, folder.companyId);
    const now = new Date().toISOString();

    if (mode === "moveChildrenUp") {
      const directChildren = await ctx.db
        .query("libraryFolders")
        .withIndex("by_companyId_parent", (q) =>
          q.eq("companyId", folder.companyId).eq("parentFolderId", folder._id),
        )
        .collect();
      for (const child of directChildren) {
        await assertUniqueSiblingName(ctx, folder.companyId, folder.parentFolderId, child.name, child._id);
        await ctx.db.patch(child._id, { parentFolderId: folder.parentFolderId, updatedAt: now });
      }
      const publications = await ctx.db
        .query("technicalPublications")
        .withIndex("by_companyId_folder", (q) =>
          q.eq("companyId", folder.companyId).eq("folderId", folder._id),
        )
        .collect();
      for (const pub of publications) {
        await ctx.db.patch(pub._id, { folderId: folder.parentFolderId, updatedAt: now });
      }
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_companyId", (q) => q.eq("companyId", folder.companyId))
        .collect();
      for (const project of projects) {
        const docs = await ctx.db
          .query("documents")
          .withIndex("by_projectId_folder", (q) =>
            q.eq("projectId", project._id).eq("folderId", folder._id),
          )
          .collect();
        for (const doc of docs) {
          await ctx.db.patch(doc._id, { folderId: folder.parentFolderId });
        }
      }
      await ctx.db.delete(folder._id);
      return { removedFolderIds: [folder._id], removedPublicationCount: 0, removedDocumentCount: 0 };
    }

    const folderIds = await collectDescendantFolderIds(ctx, folder.companyId, folder._id);
    const folderIdSet = new Set(folderIds.map((x) => String(x)));
    let removedPublicationCount = 0;
    let removedDocumentCount = 0;

    const publications = await ctx.db
      .query("technicalPublications")
      .withIndex("by_companyId", (q) => q.eq("companyId", folder.companyId))
      .collect();
    for (const pub of publications) {
      if (!pub.folderId || !folderIdSet.has(String(pub.folderId))) continue;
      const doc = await ctx.db.get(pub.documentId);
      if (doc) {
        if (doc.storageId) await ctx.storage.delete(doc.storageId);
        if (doc.extractedTextStorageId) await ctx.storage.delete(doc.extractedTextStorageId);
        await ctx.scheduler.runAfter(0, internal.documentChunks.clearForDocument, { documentId: doc._id });
        await ctx.db.delete(doc._id);
        removedDocumentCount += 1;
      }
      const sections = await ctx.db
        .query("publicationSections")
        .withIndex("by_publicationId", (q) => q.eq("publicationId", pub._id))
        .collect();
      for (const section of sections) await ctx.db.delete(section._id);
      await ctx.db.delete(pub._id);
      removedPublicationCount += 1;
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_companyId", (q) => q.eq("companyId", folder.companyId))
      .collect();
    for (const project of projects) {
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();
      for (const doc of docs) {
        if (!doc.folderId || !folderIdSet.has(String(doc.folderId))) continue;
        if (doc.storageId) await ctx.storage.delete(doc.storageId);
        if (doc.extractedTextStorageId) await ctx.storage.delete(doc.extractedTextStorageId);
        await ctx.scheduler.runAfter(0, internal.documentChunks.clearForDocument, { documentId: doc._id });
        await ctx.db.delete(doc._id);
        removedDocumentCount += 1;
      }
    }

    for (const folderId of [...folderIds].reverse()) {
      await ctx.db.delete(folderId);
    }

    return { removedFolderIds: folderIds, removedPublicationCount, removedDocumentCount };
  },
});
