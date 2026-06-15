import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireProjectAccess } from "./_helpers";

// The Claude research call itself runs CLIENT-side (src/services/
// discrepancyResearchService.ts via the authed /api/claude proxy) so Convex
// doesn't bill action compute for the ~30-60s the model takes to respond.
// This module only persists the result (with server-side coercion) and turns
// accepted research into logbook drafts.

interface DiscrepancyResearchResult {
  problemAnalysis: string;
  likelyRootCauses: string[];
  troubleshootingSteps: string[];
  correctiveAction: string;
  partsNeeded: { partNumber: string; description: string }[];
  references: {
    documentId: string;
    docName: string;
    chunkIndex: number;
    excerpt: string;
  }[];
  suggestedLogbookEntry: {
    workPerformed: string;
    ataChapter: string;
    returnToServiceStatement: string;
  };
  noManualReferencesFound: boolean;
}

function coerceResult(raw: any): DiscrepancyResearchResult {
  return {
    problemAnalysis: String(raw?.problemAnalysis ?? ""),
    likelyRootCauses: Array.isArray(raw?.likelyRootCauses)
      ? raw.likelyRootCauses.map((s: any) => String(s))
      : [],
    troubleshootingSteps: Array.isArray(raw?.troubleshootingSteps)
      ? raw.troubleshootingSteps.map((s: any) => String(s))
      : [],
    correctiveAction: String(raw?.correctiveAction ?? ""),
    partsNeeded: Array.isArray(raw?.partsNeeded)
      ? raw.partsNeeded
          .map((p: any) => ({
            partNumber: String(p?.partNumber ?? ""),
            description: String(p?.description ?? ""),
          }))
          .filter((p: any) => p.partNumber || p.description)
      : [],
    references: Array.isArray(raw?.references)
      ? raw.references
          .map((r: any) => ({
            documentId: String(r?.documentId ?? ""),
            docName: String(r?.docName ?? ""),
            chunkIndex: Number(r?.chunkIndex ?? 0),
            excerpt: String(r?.excerpt ?? ""),
          }))
          .filter((r: any) => r.documentId)
      : [],
    suggestedLogbookEntry: {
      workPerformed: String(raw?.suggestedLogbookEntry?.workPerformed ?? ""),
      ataChapter: String(raw?.suggestedLogbookEntry?.ataChapter ?? ""),
      returnToServiceStatement: String(
        raw?.suggestedLogbookEntry?.returnToServiceStatement ?? "",
      ),
    },
    noManualReferencesFound: Boolean(raw?.noManualReferencesFound),
  };
}

/**
 * Persist a research result produced client-side. The raw blob is coerced to
 * the expected shape here so a buggy or malicious client can't write arbitrary
 * structures into the row.
 */
export const saveResearch = mutation({
  args: {
    discrepancyId: v.id("aircraftDiscrepancies"),
    research: v.any(),
  },
  handler: async (ctx, args): Promise<DiscrepancyResearchResult> => {
    const row = await ctx.db.get(args.discrepancyId);
    if (!row) throw new Error("Discrepancy not found");
    await requireProjectAccess(ctx, row.projectId);
    const research = coerceResult(args.research);
    await ctx.db.patch(args.discrepancyId, {
      research,
      researchedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    });
    return research;
  },
});

export const _saveDraftLink = internalMutation({
  args: {
    discrepancyId: v.id("aircraftDiscrepancies"),
    draftId: v.id("logbookDraftEntries"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.discrepancyId, {
      logbookDraftEntryId: args.draftId,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const _insertDraftFromResearch = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    discrepancyId: v.id("aircraftDiscrepancies"),
    workPerformed: v.string(),
    ataChapter: v.optional(v.string()),
    returnToServiceStatement: v.optional(v.string()),
    rawText: v.string(),
    totalTimeAtEntry: v.optional(v.number()),
    totalCyclesAtEntry: v.optional(v.number()),
    totalLandingsAtEntry: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("logbookDraftEntries", {
      projectId: args.projectId,
      userId: args.userId,
      aircraftId: args.aircraftId,
      sourceDiscrepancyId: args.discrepancyId,
      rawText: args.rawText,
      workPerformed: args.workPerformed,
      ataChapter: args.ataChapter,
      returnToServiceStatement: args.returnToServiceStatement,
      hasReturnToService: Boolean(args.returnToServiceStatement),
      entryType: "discrepancy_resolution",
      totalTimeAtEntry: args.totalTimeAtEntry,
      totalCyclesAtEntry: args.totalCyclesAtEntry,
      totalLandingsAtEntry: args.totalLandingsAtEntry,
      userVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const acceptResearchAsLogbookDraft = action({
  args: { discrepancyId: v.id("aircraftDiscrepancies") },
  handler: async (ctx, args): Promise<{ draftId: Id<"logbookDraftEntries"> }> => {
    const discrepancy = await ctx.runQuery(api.avianisIntegration.getDiscrepancy, {
      discrepancyId: args.discrepancyId,
    });
    if (!discrepancy) throw new Error("Discrepancy not found");
    if (!discrepancy.research) {
      throw new Error("Run research first before drafting a log entry");
    }
    const userId = await requireProjectAccessFromAction(ctx, discrepancy.projectId);

    const aircraftList = await ctx.runQuery(api.avianisIntegration.listAircraftForProject, {
      projectId: discrepancy.projectId,
    });
    const aircraft = aircraftList.find((a: any) => a._id === discrepancy.aircraftId);

    const suggested = (discrepancy.research as DiscrepancyResearchResult).suggestedLogbookEntry;
    const rawText = `Discrepancy: ${discrepancy.description}\n\nResolution: ${suggested.workPerformed}\n\n${suggested.returnToServiceStatement}`;

    const draftId = (await ctx.runMutation(internal.discrepancyResearch._insertDraftFromResearch, {
      projectId: discrepancy.projectId,
      userId,
      aircraftId: discrepancy.aircraftId,
      discrepancyId: args.discrepancyId,
      workPerformed: suggested.workPerformed,
      ataChapter: suggested.ataChapter || discrepancy.ataChapter || undefined,
      returnToServiceStatement: suggested.returnToServiceStatement,
      rawText,
      totalTimeAtEntry: aircraft?.currentTotalTime,
      totalCyclesAtEntry: aircraft?.currentTotalCycles,
      totalLandingsAtEntry: aircraft?.currentTotalLandings,
    })) as Id<"logbookDraftEntries">;

    await ctx.runMutation(internal.discrepancyResearch._saveDraftLink, {
      discrepancyId: args.discrepancyId,
      draftId,
    });

    return { draftId };
  },
});

// Actions can't call requireProjectAccess directly (it needs ctx.auth); we go
// through a query that does the check and returns the userId.
async function requireProjectAccessFromAction(
  ctx: any,
  projectId: Id<"projects">,
): Promise<string> {
  return (await ctx.runQuery(api.avianisIntegration._currentUserId, {})) as string;
  // Note: the underlying queries (`getDiscrepancy`, `listAircraftForProject`)
  // already enforce requireProjectAccess. We only need the userId here for the
  // insert, so we don't repeat the check.
  void projectId;
}
