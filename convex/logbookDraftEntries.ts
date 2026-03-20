import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireLogbookEnabled, requireProjectAccess } from "./_helpers";

const draftEntryValidator = v.object({
  sourcePage: v.optional(v.number()),
  rawText: v.string(),
  entryDate: v.optional(v.string()),
  workPerformed: v.optional(v.string()),
  ataChapter: v.optional(v.string()),
  adSbReferences: v.optional(v.array(v.string())),
  totalTimeAtEntry: v.optional(v.number()),
  totalCyclesAtEntry: v.optional(v.number()),
  totalLandingsAtEntry: v.optional(v.number()),
  signerName: v.optional(v.string()),
  signerCertNumber: v.optional(v.string()),
  signerCertType: v.optional(v.string()),
  returnToServiceStatement: v.optional(v.string()),
  hasReturnToService: v.optional(v.boolean()),
  entryType: v.optional(v.string()),
  confidence: v.optional(v.number()),
  fieldConfidence: v.optional(v.any()),
  userVerified: v.optional(v.boolean()),
});

export const listByAircraft = query({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    sourceDocumentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    try {
      await requireProjectAccess(ctx, args.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Avoid hard-crashing the Logbook page when a previously selected project
      // was deleted or the user no longer has access.
      if (
        message === "Project not found" ||
        message === "Not authorized: not the project owner" ||
        message === "Not authenticated"
      ) {
        return [];
      }
      throw error;
    }
    let drafts = await ctx.db
      .query("logbookDraftEntries")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect();
    drafts = drafts.filter((d) => d.projectId === args.projectId);
    if (args.sourceDocumentId) {
      drafts = drafts.filter((d) => d.sourceDocumentId === args.sourceDocumentId);
    }
    return drafts;
  },
});

export const addBatch = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    sourceDocumentId: v.id("documents"),
    entries: v.array(draftEntryValidator),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireProjectAccess(ctx, args.projectId);
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const entry of args.entries) {
      const id = await ctx.db.insert("logbookDraftEntries", {
        projectId: args.projectId,
        userId,
        aircraftId: args.aircraftId,
        sourceDocumentId: args.sourceDocumentId,
        ...entry,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return ids;
  },
});

export const removeBySourceDocument = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    sourceDocumentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    await requireProjectAccess(ctx, args.projectId);
    const drafts = await ctx.db
      .query("logbookDraftEntries")
      .withIndex("by_aircraftId_sourceDocumentId", (q) =>
        q.eq("aircraftId", args.aircraftId).eq("sourceDocumentId", args.sourceDocumentId)
      )
      .collect();
    for (const draft of drafts) {
      if (draft.projectId !== args.projectId) continue;
      await ctx.db.delete(draft._id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const importSelected = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    draftIds: v.array(v.id("logbookDraftEntries")),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const userId = await requireProjectAccess(ctx, args.projectId);
    const now = new Date().toISOString();
    const entryIds: string[] = [];

    for (const draftId of args.draftIds) {
      const draft = await ctx.db.get(draftId);
      if (!draft) continue;
      if (draft.projectId !== args.projectId) continue;
      if (draft.aircraftId !== args.aircraftId) continue;

      const entryId = await ctx.db.insert("logbookEntries", {
        projectId: draft.projectId,
        userId,
        aircraftId: draft.aircraftId,
        sourceDocumentId: draft.sourceDocumentId,
        sourcePage: draft.sourcePage,
        rawText: draft.rawText,
        entryDate: draft.entryDate,
        workPerformed: draft.workPerformed,
        ataChapter: draft.ataChapter,
        adSbReferences: draft.adSbReferences,
        totalTimeAtEntry: draft.totalTimeAtEntry,
        totalCyclesAtEntry: draft.totalCyclesAtEntry,
        totalLandingsAtEntry: draft.totalLandingsAtEntry,
        signerName: draft.signerName,
        signerCertNumber: draft.signerCertNumber,
        signerCertType: draft.signerCertType,
        returnToServiceStatement: draft.returnToServiceStatement,
        hasReturnToService: draft.hasReturnToService,
        entryType: draft.entryType,
        confidence: draft.confidence,
        fieldConfidence: draft.fieldConfidence,
        userVerified: draft.userVerified,
        createdAt: now,
        updatedAt: now,
      });
      entryIds.push(entryId);
      await ctx.db.delete(draftId);
    }

    await ctx.db.patch(args.projectId, { updatedAt: now });
    return {
      imported: entryIds.length,
      entryIds,
    };
  },
});
