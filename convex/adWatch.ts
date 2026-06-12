import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth, requireProjectAccess } from "./_helpers";
import { normalizeAdNumber } from "./_textUtils";

/**
 * AD/SB watch persistence. The discovery itself happens client-side
 * (src/services/adWatchService.ts, Claude + web_search — same pattern as
 * revisionChecker); this module stores findings, cross-references them
 * against logbook AD references, and tracks the review workflow.
 */

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = (await ctx.db
      .query("adWatchFindings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()) as Doc<"adWatchFindings">[];
    const aircraftRows = await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const tailById = new Map(aircraftRows.map((a) => [String(a._id), a.tailNumber]));
    return rows
      .map((r) => ({ ...r, tailNumber: tailById.get(String(r.aircraftId)) }))
      .sort((a, b) => (b.adNumber < a.adNumber ? -1 : b.adNumber > a.adNumber ? 1 : 0));
  },
});

export const upsertFindings = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    findings: v.array(
      v.object({
        adNumber: v.string(),
        title: v.string(),
        summary: v.optional(v.string()),
        effectiveDate: v.optional(v.string()),
        sourceUrl: v.optional(v.string()),
        confidence: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    const aircraft = await ctx.db.get(args.aircraftId);
    if (!aircraft || String(aircraft.projectId) !== String(args.projectId)) {
      throw new Error("Aircraft does not belong to this project");
    }

    // Logbook cross-reference: every normalized AD number that appears in this
    // aircraft's logbook entries counts as "recorded".
    const entries = (await ctx.db
      .query("logbookEntries")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect()) as Doc<"logbookEntries">[];
    const recordedAds = new Set<string>();
    for (const e of entries) {
      for (const ref of [...(e.adReferences ?? []), ...(e.adSbReferences ?? [])]) {
        const normalized = normalizeAdNumber(String(ref));
        if (normalized) recordedAds.add(normalized);
      }
    }

    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const finding of args.findings) {
      const adNumber = normalizeAdNumber(finding.adNumber);
      if (!adNumber) {
        skipped += 1;
        continue;
      }
      const complianceStatus = recordedAds.has(adNumber) ? "recorded_in_logbook" : "no_logbook_record";
      const existing = await ctx.db
        .query("adWatchFindings")
        .withIndex("by_aircraftId_adNumber", (q) =>
          q.eq("aircraftId", args.aircraftId).eq("adNumber", adNumber),
        )
        .first();
      if (existing) {
        // Refresh facts + cross-ref, but never resurrect a dismissed/recorded row.
        await ctx.db.patch(existing._id, {
          title: finding.title,
          summary: finding.summary,
          effectiveDate: finding.effectiveDate,
          sourceUrl: finding.sourceUrl,
          confidence: finding.confidence,
          complianceStatus,
          checkedAt: now,
          updatedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("adWatchFindings", {
          projectId: args.projectId,
          userId,
          aircraftId: args.aircraftId,
          adNumber,
          title: finding.title,
          summary: finding.summary,
          effectiveDate: finding.effectiveDate,
          sourceUrl: finding.sourceUrl,
          confidence: finding.confidence,
          complianceStatus,
          status: "new",
          checkedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        inserted += 1;
      }
    }
    return { inserted, updated, skipped };
  },
});

export const setStatus = mutation({
  args: {
    findingId: v.id("adWatchFindings"),
    status: v.union(v.literal("new"), v.literal("recorded"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const finding = await ctx.db.get(args.findingId);
    if (!finding) throw new Error("Finding not found");
    await requireProjectAccess(ctx, finding.projectId);
    await ctx.db.patch(args.findingId, { status: args.status, updatedAt: new Date().toISOString() });
  },
});
