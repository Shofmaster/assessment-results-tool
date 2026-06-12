/**
 * Backfill `companyId` on legacy `documentChunks` rows so company-scoped vector
 * search hits the ANN index instead of falling back to a full-table scan.
 *
 * Run from your terminal against prod:
 *   npx convex run migrationsChunkCompanyId:backfillChunkCompanyIds '{"dryRun": true}'
 *   npx convex run migrationsChunkCompanyId:backfillChunkCompanyIds '{}'
 */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const DEFAULT_BATCH_SIZE = 100;

export const _patchChunkCompanyIdBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        chunkId: v.id("documentChunks"),
        companyId: v.id("companies"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let patched = 0;
    for (const item of args.items) {
      await ctx.db.patch(item.chunkId, { companyId: item.companyId });
      patched += 1;
    }
    return { patched };
  },
});

export const _listChunkCompanyIdBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("documentChunks")
      .paginate({ cursor: args.cursor, numItems: args.pageSize });

    const projectCompanyCache = new Map<string, Id<"companies"> | null>();
    const toPatch: Array<{ chunkId: Id<"documentChunks">; companyId: Id<"companies"> }> = [];
    let skippedHasCompany = 0;
    let skippedNoProjectCompany = 0;

    for (const row of result.page) {
      if (row.companyId) {
        skippedHasCompany += 1;
        continue;
      }
      const projectKey = String(row.projectId);
      if (!projectCompanyCache.has(projectKey)) {
        const project = await ctx.db.get(row.projectId);
        projectCompanyCache.set(projectKey, project?.companyId ?? null);
      }
      const companyId = projectCompanyCache.get(projectKey);
      if (!companyId) {
        skippedNoProjectCompany += 1;
        continue;
      }
      toPatch.push({ chunkId: row._id, companyId });
    }

    return {
      toPatch,
      skippedHasCompany,
      skippedNoProjectCompany,
      scanned: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const backfillChunkCompanyIds = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, args.batchSize ?? DEFAULT_BATCH_SIZE);
    const dryRun = args.dryRun ?? false;
    let cursor: string | null = null;
    let pages = 0;
    let totalScanned = 0;
    let totalPatched = 0;
    let totalSkippedHasCompany = 0;
    let totalSkippedNoProjectCompany = 0;

    while (true) {
      const batch: {
        toPatch: Array<{ chunkId: Id<"documentChunks">; companyId: Id<"companies"> }>;
        skippedHasCompany: number;
        skippedNoProjectCompany: number;
        scanned: number;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrationsChunkCompanyId._listChunkCompanyIdBatch, {
        cursor,
        pageSize: batchSize,
      });
      pages += 1;
      totalScanned += batch.scanned;
      totalSkippedHasCompany += batch.skippedHasCompany;
      totalSkippedNoProjectCompany += batch.skippedNoProjectCompany;

      if (!dryRun && batch.toPatch.length > 0) {
        const { patched } = await ctx.runMutation(
          internal.migrationsChunkCompanyId._patchChunkCompanyIdBatch,
          { items: batch.toPatch },
        );
        totalPatched += patched;
      } else if (dryRun) {
        totalPatched += batch.toPatch.length;
      }

      if (batch.isDone) break;
      cursor = batch.continueCursor;
    }

    console.log(
      "[migrationsChunkCompanyId.backfillChunkCompanyIds]",
      JSON.stringify({ dryRun, pages, totalScanned, totalPatched, totalSkippedHasCompany, totalSkippedNoProjectCompany }),
    );

    return {
      dryRun,
      pages,
      totalScanned,
      totalPatched,
      totalSkippedHasCompany,
      totalSkippedNoProjectCompany,
    };
  },
});
