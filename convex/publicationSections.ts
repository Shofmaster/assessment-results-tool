import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireCompanyOrDelegatedSupportAccess } from "./_helpers";

const sectionInputValidator = v.object({
  ataChapter: v.string(),
  ataSection: v.optional(v.string()),
  title: v.string(),
  startPage: v.number(),
  endPage: v.number(),
  depth: v.number(),
  chunkIds: v.optional(v.array(v.id("documentChunks"))),
  parentSectionId: v.optional(v.id("publicationSections")),
});

export const listByPublication = query({
  args: { publicationId: v.id("technicalPublications") },
  handler: async (ctx, args) => {
    const pub = await ctx.db.get(args.publicationId);
    if (!pub) return [];
    await requireCompanyOrDelegatedSupportAccess(ctx, pub.companyId);
    const rows = await ctx.db
      .query("publicationSections")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", args.publicationId))
      .collect();
    rows.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.startPage !== b.startPage) return a.startPage - b.startPage;
      return a.ataChapter.localeCompare(b.ataChapter);
    });
    return rows;
  },
});

function normalizeAtaChapter(ch: string): string {
  const t = ch.trim().replace(/^chapter\s+/i, "");
  const n = t.replace(/^0+/, "") || "0";
  return n;
}

export const getByAta = query({
  args: {
    publicationId: v.id("technicalPublications"),
    ataChapter: v.string(),
  },
  handler: async (ctx, args) => {
    const pub = await ctx.db.get(args.publicationId);
    if (!pub) return [];
    await requireCompanyOrDelegatedSupportAccess(ctx, pub.companyId);
    const target = normalizeAtaChapter(args.ataChapter);
    const rows = await ctx.db
      .query("publicationSections")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", args.publicationId))
      .collect();
    return rows.filter((r) => normalizeAtaChapter(r.ataChapter) === target);
  },
});

/** Replace all sections (e.g. after TOC re-ingest). Parent ids must reference rows that still exist after delete — use flat sections or omit parentSectionId. */
export const replaceAll = mutation({
  args: {
    publicationId: v.id("technicalPublications"),
    sections: v.array(sectionInputValidator),
  },
  handler: async (ctx, args) => {
    const pub = await ctx.db.get(args.publicationId);
    if (!pub) throw new Error("Publication not found");
    await requireCompanyOrDelegatedSupportAccess(ctx, pub.companyId);

    const existing = await ctx.db
      .query("publicationSections")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", args.publicationId))
      .collect();
    for (const s of existing) {
      await ctx.db.delete(s._id);
    }

    const now = new Date().toISOString();
    for (const sec of args.sections) {
      await ctx.db.insert("publicationSections", {
        publicationId: args.publicationId,
        ataChapter: sec.ataChapter,
        ataSection: sec.ataSection,
        title: sec.title,
        startPage: sec.startPage,
        endPage: sec.endPage,
        depth: sec.depth,
        chunkIds: sec.chunkIds,
        parentSectionId: sec.parentSectionId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.publicationId, { updatedAt: now });
    await ctx.db.patch(pub.projectId, { updatedAt: now });
    return { count: args.sections.length };
  },
});

/** Append sections without clearing existing (merge). */
export const bulkInsert = mutation({
  args: {
    publicationId: v.id("technicalPublications"),
    sections: v.array(sectionInputValidator),
  },
  handler: async (ctx, args) => {
    const pub = await ctx.db.get(args.publicationId);
    if (!pub) throw new Error("Publication not found");
    await requireCompanyOrDelegatedSupportAccess(ctx, pub.companyId);
    const now = new Date().toISOString();
    for (const sec of args.sections) {
      await ctx.db.insert("publicationSections", {
        publicationId: args.publicationId,
        ataChapter: sec.ataChapter,
        ataSection: sec.ataSection,
        title: sec.title,
        startPage: sec.startPage,
        endPage: sec.endPage,
        depth: sec.depth,
        chunkIds: sec.chunkIds,
        parentSectionId: sec.parentSectionId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.publicationId, { updatedAt: now });
    await ctx.db.patch(pub.projectId, { updatedAt: now });
    return { inserted: args.sections.length };
  },
});
