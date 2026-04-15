import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Platform-wide DCT catalog — one row per uploaded DCT XML file.
 * Admins upload all ~1300 DCT XMLs once; users query metadata for applicability
 * filtering, then download only the applicable files for their project.
 */

// ── Queries ──────────────────────────────────────────────────────────────────

/** List all catalog entries (metadata only — no XML content). */
export const listAll = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const q = ctx.db.query("platformDctLibrary" as any);
    return limit ? await (q as any).take(limit) : await (q as any).collect();
  },
});

/** Catalog statistics for the admin panel. */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await (ctx.db.query("platformDctLibrary" as any) as any).collect();
    const total = all.length as number;
    const byPeerGroup: Record<string, number> = {};
    for (const entry of all) {
      const pg: string = (entry as any).peerGroupLabel ?? "Unknown";
      byPeerGroup[pg] = (byPeerGroup[pg] ?? 0) + 1;
    }
    const totalQuestions = all.reduce((sum: number, e: any) => sum + (e.questionCount ?? 0), 0);
    return { total, byPeerGroup, totalQuestions };
  },
});

/** Check which contentHashes already exist in the catalog (for pre-dedup). */
export const checkExistingHashes = query({
  args: { hashes: v.array(v.string()) },
  handler: async (ctx, { hashes }) => {
    const result: string[] = [];
    for (const hash of hashes) {
      const existing = await ctx.db
        .query("platformDctLibrary" as any)
        .withIndex("by_contentHash" as any, (q: any) => q.eq("contentHash", hash))
        .first();
      if (existing) result.push(hash);
    }
    return result;
  },
});

/** Get a signed download URL for a catalog entry's stored XML file. */
export const getFileUrl = query({
  args: { entryId: v.string() },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get(entryId as any);
    if (!entry || !(entry as any).storageId) return null;
    return await ctx.storage.getUrl((entry as any).storageId);
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/** Admin: bulk insert catalog entries (called after parsing XML files client-side). */
export const adminBulkIngest = mutation({
  args: {
    entries: v.array(
      v.object({
        standardDctId: v.optional(v.string()),
        standardDctDetailId: v.optional(v.string()),
        fileName: v.string(),
        dctVersionNumber: v.optional(v.string()),
        dctVersionDate: v.optional(v.string()),
        peerGroupLabel: v.optional(v.string()),
        assessmentTypeLabel: v.optional(v.string()),
        specialtyLabel: v.optional(v.string()),
        mlfLabel: v.optional(v.string()),
        purpose: v.optional(v.string()),
        storageId: v.optional(v.id("_storage")),
        contentHash: v.string(),
        questionCount: v.number(),
        uploadedByUserId: v.string(),
      })
    ),
    /** If true, replace existing entries with same contentHash rather than skip. */
    replaceExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, { entries, replaceExisting }) => {
    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    let replaced = 0;

    for (const entry of entries) {
      const existing = await ctx.db
        .query("platformDctLibrary" as any)
        .withIndex("by_contentHash" as any, (q: any) => q.eq("contentHash", entry.contentHash))
        .first();

      if (existing) {
        if (replaceExisting) {
          await ctx.db.patch((existing as any)._id, {
            ...entry,
            uploadedAt: now,
          } as any);
          replaced++;
        } else {
          skipped++;
        }
        continue;
      }

      await ctx.db.insert("platformDctLibrary" as any, {
        ...entry,
        uploadedAt: now,
      } as any);
      inserted++;
    }

    return { inserted, skipped, replaced };
  },
});

/** Admin: delete a single catalog entry (also deletes the stored file blob). */
export const adminDelete = mutation({
  args: { entryId: v.string() },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get(entryId as any);
    if (!entry) return;
    if ((entry as any).storageId) {
      try { await ctx.storage.delete((entry as any).storageId); } catch { /* ignore */ }
    }
    await ctx.db.delete((entry as any)._id);
  },
});

/** Admin: clear all catalog entries (full re-upload). Requires confirmation token. */
export const adminClearAll = mutation({
  args: { confirm: v.literal("CLEAR_ALL_DCT_LIBRARY") },
  handler: async (ctx, { confirm: _ }) => {
    const all = await (ctx.db.query("platformDctLibrary" as any) as any).collect();
    for (const entry of all) {
      if ((entry as any).storageId) {
        try { await ctx.storage.delete((entry as any).storageId); } catch { /* ignore */ }
      }
      await ctx.db.delete((entry as any)._id);
    }
    return { deleted: all.length };
  },
});
