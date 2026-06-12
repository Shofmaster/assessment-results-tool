/**
 * One-shot migrations / maintenance utilities.
 *
 * Run from your terminal against prod:
 *   npx convex run migrationsBandwidth:migrateInlineTextToStorage '{"dryRun": true}'
 *   npx convex run migrationsBandwidth:migrateInlineTextToStorage '{}'
 *
 * Why this exists:
 *   `documents.listByProject` and `documents.listByCompany` `.collect()` every
 *   document row including the (possibly large) inline `extractedText` field.
 *   Convex enforces a 16 MiB per-function-execution read ceiling, so once a
 *   project / company accumulates enough text-heavy documents those queries
 *   start failing with `Too many bytes read in a single function execution`,
 *   which surfaces in the browser as a "Server Error" and breaks the screens
 *   that depend on those subscriptions (library, splash diagnostics, etc).
 *
 *   This migration walks every `documents` row, and for any row whose inline
 *   `extractedText` is over `MIGRATION_THRESHOLD_BYTES` and which does not
 *   already have an `extractedTextStorageId`, it:
 *     1. Uploads the full text to `_storage` as a UTF-8 blob (via the action's
 *        `ctx.storage.store`, which is only available in actions).
 *     2. Patches the row to keep a small preview inline + set the storage id.
 *
 *   The client helper `resolveExtractedText` already prefers the storage
 *   payload when `extractedTextStorageId` is set, so no frontend change is
 *   required.
 */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Anything strictly larger than this in inline `extractedText` (UTF-8 bytes)
 * is moved to `_storage`. Small extractions (< ~5 KB) stay inline so that
 * "has text" UI checks remain free and we don't generate thousands of tiny
 * storage files.
 */
const MIGRATION_THRESHOLD_BYTES = 5_000;

/**
 * Bytes of `extractedText` retained inline as a preview after spilling to
 * storage. Used by the client only as a fallback when storage fetch fails,
 * so a small slice is enough.
 */
const INLINE_PREVIEW_BYTES = 1_500;

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Clamp `raw` to at most `maxBytes` UTF-8 bytes without splitting code points. */
function clampUtf8ByBytes(raw: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(raw).length <= maxBytes) return raw;
  let low = 0;
  let high = raw.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (enc.encode(raw.slice(0, mid)).length <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return raw.slice(0, low);
}

/**
 * Internal: paginate through `documents` and report which rows look like
 * migration candidates. Returns only metadata to keep each page small.
 */
export const _listInlineTextBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("documents")
      .paginate({ cursor: args.cursor, numItems: args.pageSize });
    return {
      items: result.page.map((doc) => ({
        id: doc._id,
        textBytes: doc.extractedText ? utf8ByteLength(doc.extractedText) : 0,
        hasOverflow: !!doc.extractedTextStorageId,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Internal: fetch a single document's inline `extractedText` (one-row read). */
export const _readInlineText = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    return {
      extractedText: doc.extractedText ?? "",
      hasOverflow: !!doc.extractedTextStorageId,
    };
  },
});

/** Internal: patch a doc with a storage id + clamped inline preview. */
export const _applyMigratedDoc = internalMutation({
  args: {
    documentId: v.id("documents"),
    extractedTextStorageId: v.id("_storage"),
    extractedTextPreview: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      extractedText: args.extractedTextPreview,
      extractedTextStorageId: args.extractedTextStorageId,
    });
  },
});

/**
 * Driver: paginate through every `documents` row and migrate any whose inline
 * `extractedText` exceeds `MIGRATION_THRESHOLD_BYTES`.
 *
 * Args:
 *   - `batchSize` (optional, default 25): docs per pagination page.
 *   - `dryRun` (optional, default false): if true, only report what would change.
 */
export const migrateInlineTextToStorage = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 25;
    const dryRun = args.dryRun ?? false;
    let cursor: string | null = null;
    let totalScanned = 0;
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalAlreadyOverflow = 0;
    let totalErrors = 0;
    let bytesReclaimed = 0;
    let pages = 0;

    while (true) {
      const batch: {
        items: Array<{ id: Id<"documents">; textBytes: number; hasOverflow: boolean }>;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrationsBandwidth._listInlineTextBatch, {
        cursor,
        pageSize: batchSize,
      });
      pages += 1;

      for (const item of batch.items) {
        totalScanned += 1;
        if (item.hasOverflow) {
          totalAlreadyOverflow += 1;
          continue;
        }
        if (item.textBytes <= MIGRATION_THRESHOLD_BYTES) {
          totalSkipped += 1;
          continue;
        }
        if (dryRun) {
          totalMigrated += 1;
          bytesReclaimed += item.textBytes;
          continue;
        }

        try {
          const row = await ctx.runQuery(internal.migrationsBandwidth._readInlineText, {
            documentId: item.id,
          });
          if (!row || row.hasOverflow) {
            totalSkipped += 1;
            continue;
          }
          const text = row.extractedText;
          const bytes = utf8ByteLength(text);
          if (bytes <= MIGRATION_THRESHOLD_BYTES) {
            totalSkipped += 1;
            continue;
          }
          const storageId = await ctx.storage.store(
            new Blob([text], { type: "text/plain;charset=utf-8" }),
          );
          await ctx.runMutation(internal.migrationsBandwidth._applyMigratedDoc, {
            documentId: item.id,
            extractedTextStorageId: storageId,
            extractedTextPreview: clampUtf8ByBytes(text, INLINE_PREVIEW_BYTES),
          });
          totalMigrated += 1;
          bytesReclaimed += bytes;
        } catch (err) {
          totalErrors += 1;
          console.error(
            `migrationsBandwidth.migrateInlineTextToStorage: failed for ${String(item.id)}`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (batch.isDone) break;
      cursor = batch.continueCursor;
    }

    return {
      dryRun,
      pages,
      totalScanned,
      totalMigrated,
      totalSkipped,
      totalAlreadyOverflow,
      totalErrors,
      bytesReclaimed,
      remainingPreviewBytesPerDocCap: INLINE_PREVIEW_BYTES,
      thresholdBytes: MIGRATION_THRESHOLD_BYTES,
    };
  },
});
