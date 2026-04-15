import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectOwner, requireCompanyRole } from "./_helpers";
import { computeDctComplianceStatus } from "./lib/dctStatus";

const questionInValidator = v.object({
  questionId: v.string(),
  questionDetailsId: v.optional(v.string()),
  qVersionNumber: v.optional(v.string()),
  qVersionDate: v.optional(v.string()),
  displayOrder: v.optional(v.number()),
  text: v.string(),
  safetyAttribute: v.optional(v.string()),
  questionType: v.optional(v.string()),
  scopingAttribute: v.optional(v.string()),
  noteToUser: v.optional(v.string()),
  references: v.array(
    v.object({
      srcId: v.optional(v.string()),
      label: v.string(),
    }),
  ),
  responses: v.array(v.string()),
});

const documentInValidator = v.object({
  fileName: v.string(),
  contentHash: v.string(),
  standardDctId: v.optional(v.string()),
  standardDctDetailId: v.optional(v.string()),
  dctVersionNumber: v.optional(v.string()),
  dctVersionDate: v.optional(v.string()),
  dctStatus: v.optional(v.string()),
  mlfId: v.optional(v.string()),
  mlfLabel: v.optional(v.string()),
  mlfName: v.optional(v.string()),
  assessmentTypeLabel: v.optional(v.string()),
  specialtyLabel: v.optional(v.string()),
  peerGroupLabel: v.optional(v.string()),
  purpose: v.optional(v.string()),
  objective: v.optional(v.string()),
  questions: v.array(questionInValidator),
});

async function deleteQuestionsAndComparisonsForDoc(
  ctx: { db: any },
  dctDocumentId: Id<"dctToolDocuments">,
): Promise<number> {
  const qs = await ctx.db
    .query("dctQuestions")
    .withIndex("by_dctDocumentId", (q: any) => q.eq("dctDocumentId", dctDocumentId))
    .collect();
  for (const q of qs) {
    const comps = await ctx.db
      .query("dctComparisons")
      .withIndex("by_questionId", (x: any) => x.eq("questionId", q._id))
      .collect();
    for (const c of comps) await ctx.db.delete(c._id);
    await ctx.db.delete(q._id);
  }
  return qs.length;
}

async function insertQuestionsAndComparisonsForProjectDoc(
  ctx: { db: any },
  args: {
    projectId: Id<"projects">;
    userId: string;
    dctDocumentId: Id<"dctToolDocuments">;
    questions: any[];
    now: string;
  },
) {
  for (const q of args.questions) {
    const qid = await ctx.db.insert("dctQuestions", {
      projectId: args.projectId,
      dctDocumentId: args.dctDocumentId,
      questionId: q.questionId,
      questionDetailsId: q.questionDetailsId,
      qVersionNumber: q.qVersionNumber,
      qVersionDate: q.qVersionDate,
      displayOrder: q.displayOrder,
      text: q.text,
      safetyAttribute: q.safetyAttribute,
      questionType: q.questionType,
      scopingAttribute: q.scopingAttribute,
      noteToUser: q.noteToUser,
      references: q.references?.length ? q.references : undefined,
      responses: q.responses?.length ? q.responses : undefined,
      createdAt: args.now,
    });
    await ctx.db.insert("dctComparisons", {
      projectId: args.projectId,
      questionId: qid,
      status: "pending",
      updatedAt: args.now,
      userId: args.userId,
    });
  }
}

async function countComparisonsForDoc(
  ctx: { db: any },
  dctDocumentId: Id<"dctToolDocuments">,
) {
  const qs = await ctx.db
    .query("dctQuestions")
    .withIndex("by_dctDocumentId", (q: any) => q.eq("dctDocumentId", dctDocumentId))
    .collect();
  let count = 0;
  for (const q of qs) {
    const comps = await ctx.db
      .query("dctComparisons")
      .withIndex("by_questionId", (x: any) => x.eq("questionId", q._id))
      .collect();
    count += comps.length;
  }
  return { questionCount: qs.length, comparisonCount: count };
}

export const getSummary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const settings = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    const docs = await ctx.db
      .query("dctToolDocuments")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    // Use cached counts to avoid reading unbounded question/comparison tables.
    // cachedQuestionCount / cachedComparisonTotal are maintained by ingest mutations.
    const questionCount = settings?.cachedQuestionCount ?? 0;
    const totalCandidateDcts = settings?.cachedComparisonTotal ?? 0;
    // Sample a bounded slice of comparisons to compute status-breakdown stats.
    // 2000 rows keeps total query reads well under Convex's 16 384-read limit.
    const comparisonSample = await ctx.db
      .query("dctComparisons")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .take(2000);
    const unresolvedGapOrMismatch = comparisonSample.filter(
      (c: any) =>
        !c.resolved && (c.status === "gap" || c.status === "mismatch"),
    ).length;
    const pending = comparisonSample.filter((c: any) => c.status === "pending").length;
    const applicableCount = comparisonSample.filter((c: any) => c.applicabilityState === "applicable").length;
    const unsureCount = comparisonSample.filter((c: any) => c.applicabilityState === "unsure").length;
    const notApplicableCount = comparisonSample.filter((c: any) => c.applicabilityState === "not_applicable").length;
    const applicableCoverage = totalCandidateDcts > 0 ? applicableCount / totalCandidateDcts : 0;
    const coverageTarget = 0.06;
    const status = computeDctComplianceStatus({
      lastCheckCompletedAt: settings?.lastCheckCompletedAt,
      nextDueAt: settings?.nextDueAt,
      unresolvedGapOrMismatch,
    });
    const overdue =
      !!settings?.nextDueAt && new Date(settings.nextDueAt).getTime() < Date.now();
    return {
      settings,
      profile,
      docCount: docs.length,
      questionCount,
      comparisonStats: {
        unresolvedGapOrMismatch,
        pending,
        total: totalCandidateDcts,
        applicableCount,
        unsureCount,
        notApplicableCount,
        totalCandidateDcts,
        applicableCoverage,
        coverageTarget,
        belowCoverageTarget: applicableCoverage < coverageTarget,
      },
      status,
      overdue,
    };
  },
});

export const listToolDocuments = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    return await ctx.db
      .query("dctToolDocuments")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

export const listQuestionsForDocument = query({
  args: { projectId: v.id("projects"), dctDocumentId: v.id("dctToolDocuments") },
  handler: async (ctx, { projectId, dctDocumentId }) => {
    await requireProjectOwner(ctx, projectId);
    const doc = await ctx.db.get(dctDocumentId);
    if (!doc || doc.projectId !== projectId) return [];
    return await ctx.db
      .query("dctQuestions")
      .withIndex("by_dctDocumentId", (q) => q.eq("dctDocumentId", dctDocumentId))
      .collect();
  },
});

export const listComparisons = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    return await ctx.db
      .query("dctComparisons")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

/** Matrix / UI: comparison joined to question + DCT document metadata. */
export const listComparisonsEnriched = query({
  args: {
    projectId: v.id("projects"),
    /** Hard cap on rows returned. Each row costs 3 reads (comparison + question + document).
     *  Default 500 keeps total reads well under Convex's 16 384-read limit. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, limit }) => {
    await requireProjectOwner(ctx, projectId);
    const cap = Math.min(limit ?? 500, 500);
    const comps = await ctx.db
      .query("dctComparisons")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .take(cap);
    const out: Array<{
      comparison: Doc<"dctComparisons">;
      question: Doc<"dctQuestions">;
      dctDocument: Doc<"dctToolDocuments">;
    }> = [];
    for (const c of comps) {
      const question = await ctx.db.get(c.questionId);
      if (!question) continue;
      const dctDocument = await ctx.db.get(question.dctDocumentId);
      if (!dctDocument) continue;
      out.push({ comparison: c, question, dctDocument });
    }
    out.sort((a, b) => {
      const fa = a.dctDocument.fileName ?? "";
      const fb = b.dctDocument.fileName ?? "";
      if (fa !== fb) return fa.localeCompare(fb);
      const oa = a.question.displayOrder ?? 0;
      const ob = b.question.displayOrder ?? 0;
      if (oa !== ob) return oa - ob;
      return a.question.text.localeCompare(b.question.text);
    });
    return out;
  },
});

export const listRevisionChecks = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, { projectId, limit }) => {
    await requireProjectOwner(ctx, projectId);
    const rows = await ctx.db
      .query("dctRevisionChecks")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    rows.sort((a: any, b: any) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
    return rows.slice(0, limit ?? 30);
  },
});

export const listReports = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, { projectId, limit }) => {
    await requireProjectOwner(ctx, projectId);
    const rows = await ctx.db
      .query("dctReports")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    rows.sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return rows.slice(0, limit ?? 20);
  },
});

export const listDrssCatalog = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    return await ctx.db
      .query("dctDrssCatalogEntries")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

export const upsertSettings = mutation({
  args: {
    projectId: v.id("projects"),
    scheduleIntervalDays: v.optional(v.number()),
    showAllDcts: v.optional(v.boolean()),
    includedPeerGroupSubstrings: v.optional(v.array(v.string())),
    excludedPeerGroupSubstrings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.scheduleIntervalDays != null) patch.scheduleIntervalDays = args.scheduleIntervalDays;
    if (args.showAllDcts != null) patch.showAllDcts = args.showAllDcts;
    if (args.includedPeerGroupSubstrings != null) {
      patch.includedPeerGroupSubstrings = args.includedPeerGroupSubstrings;
    }
    if (args.excludedPeerGroupSubstrings != null) {
      patch.excludedPeerGroupSubstrings = args.excludedPeerGroupSubstrings;
    }
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("dctProjectSettings", {
      projectId: args.projectId,
      userId,
      scheduleIntervalDays: args.scheduleIntervalDays ?? 7,
      showAllDcts: args.showAllDcts ?? false,
      includedPeerGroupSubstrings: args.includedPeerGroupSubstrings,
      excludedPeerGroupSubstrings: args.excludedPeerGroupSubstrings,
      updatedAt: now,
    });
  },
});

export const ingestXmlBatch = mutation({
  args: {
    projectId: v.id("projects"),
    documents: v.array(documentInValidator),
    /** When true, do not rebuild questions/comparisons for docs already present by contentHash. */
    skipExistingByHash: v.optional(v.boolean()),
  },
  handler: async (ctx, { projectId, documents, skipExistingByHash }) => {
    const userId = await requireProjectOwner(ctx, projectId);
    const now = new Date().toISOString();
    let settings = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (!settings) {
      await ctx.db.insert("dctProjectSettings", {
        projectId,
        userId,
        scheduleIntervalDays: 7,
        showAllDcts: false,
        updatedAt: now,
      });
      settings = await ctx.db
        .query("dctProjectSettings")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .first();
    }

    const checkId = await ctx.db.insert("dctRevisionChecks", {
      projectId,
      userId,
      kind: "xml_ingest",
      startedAt: now,
      summary: `Ingest ${documents.length} DCT file(s)`,
    });

    let newOrUpdated = 0;
    let skippedExisting = 0;
    let questionDelta = 0; // net change in questions/comparisons for cached count
    for (const d of documents) {
      const existing = await ctx.db
        .query("dctToolDocuments")
        .withIndex("by_projectId_hash", (q) =>
          q.eq("projectId", projectId).eq("contentHash", d.contentHash),
        )
        .first();

      let docId: Id<"dctToolDocuments">;
      if (existing) {
        if (skipExistingByHash === true) {
          skippedExisting++;
          continue;
        }
        docId = existing._id;
        const deletedCount = await deleteQuestionsAndComparisonsForDoc(ctx, docId);
        questionDelta -= deletedCount;
        await ctx.db.patch(docId, {
          fileName: d.fileName,
          source: "xml",
          contentHash: d.contentHash,
          standardDctId: d.standardDctId,
          standardDctDetailId: d.standardDctDetailId,
          dctVersionNumber: d.dctVersionNumber,
          dctVersionDate: d.dctVersionDate,
          dctStatus: d.dctStatus,
          mlfId: d.mlfId,
          mlfLabel: d.mlfLabel,
          mlfName: d.mlfName,
          assessmentTypeLabel: d.assessmentTypeLabel,
          specialtyLabel: d.specialtyLabel,
          peerGroupLabel: d.peerGroupLabel,
          purpose: d.purpose,
          objective: d.objective,
          updatedAt: now,
        });
      } else {
        docId = await ctx.db.insert("dctToolDocuments", {
          projectId,
          userId,
          source: "xml",
          fileName: d.fileName,
          contentHash: d.contentHash,
          standardDctId: d.standardDctId,
          standardDctDetailId: d.standardDctDetailId,
          dctVersionNumber: d.dctVersionNumber,
          dctVersionDate: d.dctVersionDate,
          dctStatus: d.dctStatus,
          mlfId: d.mlfId,
          mlfLabel: d.mlfLabel,
          mlfName: d.mlfName,
          assessmentTypeLabel: d.assessmentTypeLabel,
          specialtyLabel: d.specialtyLabel,
          peerGroupLabel: d.peerGroupLabel,
          purpose: d.purpose,
          objective: d.objective,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const q of d.questions) {
        const qid = await ctx.db.insert("dctQuestions", {
          projectId,
          dctDocumentId: docId,
          questionId: q.questionId,
          questionDetailsId: q.questionDetailsId,
          qVersionNumber: q.qVersionNumber,
          qVersionDate: q.qVersionDate,
          displayOrder: q.displayOrder,
          text: q.text,
          safetyAttribute: q.safetyAttribute,
          questionType: q.questionType,
          scopingAttribute: q.scopingAttribute,
          noteToUser: q.noteToUser,
          references: q.references.length ? q.references : undefined,
          responses: q.responses.length ? q.responses : undefined,
          createdAt: now,
        });
        await ctx.db.insert("dctComparisons", {
          projectId,
          questionId: qid,
          status: "pending",
          updatedAt: now,
          userId,
        });
        questionDelta++;
      }
      newOrUpdated++;
    }

    const newCachedCount = Math.max(0, (settings!.cachedQuestionCount ?? 0) + questionDelta);
    await ctx.db.patch(settings!._id, {
      lastXmlIngestAt: now,
      updatedAt: now,
      cachedQuestionCount: newCachedCount,
      cachedComparisonTotal: newCachedCount,
    });

    await ctx.db.patch(checkId, {
      completedAt: now,
      newOrUpdatedCount: newOrUpdated,
      summary:
        skippedExisting > 0
          ? `Ingested/updated ${newOrUpdated} DCT document(s); skipped ${skippedExisting} unchanged`
          : `Ingested/updated ${newOrUpdated} DCT document(s)`,
    });

    return { ingested: newOrUpdated, skippedExisting, revisionCheckId: checkId };
  },
});

export const syncDrssCatalog = mutation({
  args: {
    projectId: v.id("projects"),
    entries: v.array(
      v.object({
        documentNumber: v.string(),
        title: v.string(),
        dctRevision: v.optional(v.string()),
        revisionDate: v.optional(v.string()),
        peerGroupLabel: v.optional(v.string()),
        inspectorSpecialty: v.optional(v.string()),
        status: v.optional(v.string()),
        drsUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { projectId, entries }) => {
    const userId = await requireProjectOwner(ctx, projectId);
    const now = new Date().toISOString();
    const settings = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (!settings) {
      await ctx.db.insert("dctProjectSettings", {
        projectId,
        userId,
        scheduleIntervalDays: 7,
        updatedAt: now,
      });
    }
    const checkId = await ctx.db.insert("dctRevisionChecks", {
      projectId,
      userId,
      kind: "drs_sync",
      startedAt: now,
      summary: `DRS catalog sync (${entries.length} rows)`,
    });
    for (const e of entries) {
      const existing = await ctx.db
        .query("dctDrssCatalogEntries")
        .withIndex("by_projectId_documentNumber", (q) =>
          q.eq("projectId", projectId).eq("documentNumber", e.documentNumber),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          title: e.title,
          dctRevision: e.dctRevision,
          revisionDate: e.revisionDate,
          peerGroupLabel: e.peerGroupLabel,
          inspectorSpecialty: e.inspectorSpecialty,
          status: e.status,
          drsUrl: e.drsUrl,
          fetchedAt: now,
        });
      } else {
        await ctx.db.insert("dctDrssCatalogEntries", {
          projectId,
          documentNumber: e.documentNumber,
          title: e.title,
          dctRevision: e.dctRevision,
          revisionDate: e.revisionDate,
          peerGroupLabel: e.peerGroupLabel,
          inspectorSpecialty: e.inspectorSpecialty,
          status: e.status,
          drsUrl: e.drsUrl,
          fetchedAt: now,
        });
      }
    }
    const s = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (s) {
      await ctx.db.patch(s._id, { lastDrssyncAt: now, updatedAt: now });
    }
    await ctx.db.patch(checkId, {
      completedAt: now,
      newOrUpdatedCount: entries.length,
    });
    return { synced: entries.length, revisionCheckId: checkId };
  },
});

export const addDrssEntriesToSharedReferences = mutation({
  args: {
    projectId: v.id("projects"),
    companyId: v.id("companies"),
    entries: v.array(
      v.object({
        documentNumber: v.string(),
        title: v.string(),
        dctRevision: v.optional(v.string()),
        revisionDate: v.optional(v.string()),
        drsUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { projectId, companyId, entries }) => {
    await requireProjectOwner(ctx, projectId);
    const project = await ctx.db.get(projectId);
    if (!project?.companyId || project.companyId !== companyId) {
      throw new Error("Project must belong to the selected company");
    }
    const addedBy = await requireCompanyRole(ctx, companyId, [
      "company_admin",
      "company_manager",
    ]);
    const now = new Date().toISOString();
    const ids: Id<"sharedReferenceDocuments">[] = [];
    for (const e of entries) {
      const id = await ctx.db.insert("sharedReferenceDocuments", {
        documentType: "faa_sas_dct",
        canonicalDocType: "faa_sas_dct",
        name: `${e.title} (${e.documentNumber})`,
        path: e.documentNumber,
        source: "drs",
        sourceUrl: e.drsUrl,
        issuer: "FAA DRS / SAS DCT",
        effectiveDate: e.revisionDate,
        revision: e.dctRevision,
        notes: `Imported from DRS catalog for DCT Compliance module.`,
        companyId,
        addedAt: now,
        addedBy,
      });
      ids.push(id);
    }
    return { inserted: ids.length, ids };
  },
});

/** Apply many AI/heuristic traceability results in one round-trip. */
export const bulkApplyTraceabilityResults = mutation({
  args: {
    projectId: v.id("projects"),
    results: v.array(
      v.object({
        comparisonId: v.id("dctComparisons"),
        status: v.union(
          v.literal("pending"),
          v.literal("aligned"),
          v.literal("gap"),
          v.literal("mismatch"),
        ),
        underReviewDocumentId: v.optional(v.id("documents")),
        evidenceSnippet: v.optional(v.string()),
        rationale: v.optional(v.string()),
        lowConfidenceApplicability: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { projectId, results }) => {
    const userId = await requireProjectOwner(ctx, projectId);
    const now = new Date().toISOString();
    let applied = 0;
    for (const r of results) {
      const row = await ctx.db.get(r.comparisonId);
      if (!row || row.projectId !== projectId) continue;
      await ctx.db.patch(r.comparisonId, {
        status: r.status,
        underReviewDocumentId: r.underReviewDocumentId,
        evidenceSnippet: r.evidenceSnippet,
        rationale: r.rationale,
        applicabilityState: r.lowConfidenceApplicability ? "unsure" : row.applicabilityState,
        updatedAt: now,
        userId,
      });
      applied++;
    }
    return { applied };
  },
});

export const updateComparison = mutation({
  args: {
    projectId: v.id("projects"),
    comparisonId: v.id("dctComparisons"),
    status: v.union(
      v.literal("pending"),
      v.literal("aligned"),
      v.literal("gap"),
      v.literal("mismatch"),
    ),
    underReviewDocumentId: v.optional(v.id("documents")),
    evidenceSnippet: v.optional(v.string()),
    rationale: v.optional(v.string()),
    resolved: v.optional(v.boolean()),
    applicabilityState: v.optional(
      v.union(
        v.literal("applicable"),
        v.literal("unsure"),
        v.literal("not_applicable"),
      ),
    ),
    applicabilityConfidence: v.optional(v.number()),
    applicabilitySource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const row = await ctx.db.get(args.comparisonId);
    if (!row || row.projectId !== args.projectId) throw new Error("Not found");
    await ctx.db.patch(args.comparisonId, {
      status: args.status,
      underReviewDocumentId: args.underReviewDocumentId,
      evidenceSnippet: args.evidenceSnippet,
      rationale: args.rationale,
      resolved: args.resolved,
      applicabilityState: args.applicabilityState,
      applicabilityConfidence: args.applicabilityConfidence,
      applicabilitySource: args.applicabilitySource,
      updatedAt: new Date().toISOString(),
      userId,
    });
    return args.comparisonId;
  },
});

export const completeScheduledCheck = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireProjectOwner(ctx, projectId);
    const now = new Date().toISOString();
    let settings = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    if (!settings) {
      await ctx.db.insert("dctProjectSettings", {
        projectId,
        userId,
        scheduleIntervalDays: 7,
        updatedAt: now,
      });
      settings = await ctx.db
        .query("dctProjectSettings")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .first();
    }
    const days = settings!.scheduleIntervalDays ?? 7;
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + days);
    const nextDueAt = next.toISOString();
    await ctx.db.patch(settings!._id, {
      lastCheckCompletedAt: now,
      nextDueAt,
      updatedAt: now,
    });
    const comparisons = await ctx.db
      .query("dctComparisons")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    const unresolvedGapOrMismatch = comparisons.filter(
      (c: any) =>
        !c.resolved && (c.status === "gap" || c.status === "mismatch"),
    ).length;
    const status = computeDctComplianceStatus({
      lastCheckCompletedAt: now,
      nextDueAt,
      unresolvedGapOrMismatch,
    });
    await ctx.db.patch(settings!._id, { lastStatus: status, updatedAt: now });
    await ctx.db.insert("dctRevisionChecks", {
      projectId,
      userId,
      kind: "compare_run",
      startedAt: now,
      completedAt: now,
      summary: `Check completed; next due ${nextDueAt}; status ${status}`,
    });
    return { lastCheckCompletedAt: now, nextDueAt, status };
  },
});

export const createReport = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    verdict: v.union(
      v.literal("pass"),
      v.literal("conditional"),
      v.literal("fail"),
      v.literal("pending"),
    ),
    stats: v.optional(v.any()),
    markdownBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("dctReports", {
      projectId: args.projectId,
      userId,
      createdAt: now,
      title: args.title,
      verdict: args.verdict,
      stats: args.stats,
      markdownBody: args.markdownBody,
    });
  },
});

/** Weekly Convex cron: record tick for projects past nextDueAt (visibility + audit). */
export const weeklyScheduleTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("dctProjectSettings").collect();
    const now = new Date().toISOString();
    for (const s of all) {
      if (!s.nextDueAt) continue;
      if (new Date(s.nextDueAt).getTime() < Date.now()) {
        await ctx.db.insert("dctRevisionChecks", {
          projectId: s.projectId,
          userId: "system",
          kind: "scheduled_tick",
          startedAt: now,
          completedAt: now,
          summary: "Scheduled reminder: DCT compliance check is due (nextDueAt passed).",
        });
      }
    }
    return { processed: all.length };
  },
});
