import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCompanyOrDelegatedSupportAccess, requireProjectOwner } from "./_helpers";
import { collectVisibleForCompany } from "./sharedReferenceDocuments";
import { computeDctComplianceStatus } from "./lib/dctStatus";

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
  await Promise.all(
    args.questions.map(async (q) => {
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
    }),
  );
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

/** Parsed DCT library rows for a company (for Library UI labels). */
export const listParsedLibraryDocsByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, companyId);
    const rows = await ctx.db
      .query("dctParsedLibraryDocuments")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .collect();
    return rows.map((d: Doc<"dctParsedLibraryDocuments">) => ({
      contentHash: d.contentHash,
      fileName: d.fileName,
      standardDctId: d.standardDctId,
      mlfLabel: d.mlfLabel,
      peerGroupLabel: d.peerGroupLabel,
      purpose: d.purpose,
    }));
  },
});

/**
 * Copy pre-parsed DCT questions from company cache (`dctParsedLibrary*`) into this project.
 * No XML download or re-parse. Skips hashes already present on `dctToolDocuments` for the project.
 */
export const ingestFromParsedLibrary = mutation({
  args: {
    projectId: v.id("projects"),
    /** When omitted, ingests every `faa_sas_dct` shared ref (with storage + contentHash) visible to the company. */
    contentHashes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { projectId, contentHashes }) => {
    const userId = await requireProjectOwner(ctx, projectId);
    const project = await ctx.db.get(projectId);
    if (!project?.companyId) {
      throw new Error("Project has no company; cannot ingest DCT library.");
    }
    const companyId = project.companyId;
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

    const visible = await collectVisibleForCompany(ctx, companyId);
    const dctRefs = visible.filter(
      (d: any) =>
        (String(d.documentType ?? "").toLowerCase() === "faa_sas_dct" ||
          String(d.canonicalDocType ?? "").toLowerCase() === "faa_sas_dct") &&
        d.storageId &&
        typeof d.contentHash === "string" &&
        String(d.contentHash).trim(),
    );
    const hashSet = new Set<string>(
      contentHashes?.length
        ? contentHashes.map((h) => String(h).trim()).filter(Boolean)
        : dctRefs.map((r: any) => String(r.contentHash).trim()),
    );
    const hashes = [...hashSet];

    const checkId = await ctx.db.insert("dctRevisionChecks", {
      projectId,
      userId,
      kind: "xml_ingest",
      startedAt: now,
      summary: `Ingest from parsed library (${hashes.length} candidate hash(es))`,
    });

    let ingestedDocs = 0;
    let skippedExisting = 0;
    let skippedNoCache = 0;
    let questionDelta = 0;

    for (const rawHash of hashes) {
      const ch = rawHash.trim();
      if (!ch) continue;

      const existingTool = await ctx.db
        .query("dctToolDocuments")
        .withIndex("by_projectId_hash", (q) =>
          q.eq("projectId", projectId).eq("contentHash", ch),
        )
        .first();
      if (existingTool) {
        skippedExisting++;
        continue;
      }

      const parsedDoc = await ctx.db
        .query("dctParsedLibraryDocuments")
        .withIndex("by_companyId_hash", (q) =>
          q.eq("companyId", companyId).eq("contentHash", ch),
        )
        .first();
      if (!parsedDoc) {
        skippedNoCache++;
        continue;
      }

      const parsedQs = await ctx.db
        .query("dctParsedLibraryQuestions")
        .withIndex("by_companyId_hash", (q) =>
          q.eq("companyId", companyId).eq("contentHash", ch),
        )
        .collect();

      const docId = await ctx.db.insert("dctToolDocuments", {
        projectId,
        userId,
        source: "xml",
        fileName: parsedDoc.fileName,
        contentHash: ch,
        standardDctId: parsedDoc.standardDctId,
        standardDctDetailId: parsedDoc.standardDctDetailId,
        dctVersionNumber: parsedDoc.dctVersionNumber,
        dctVersionDate: parsedDoc.dctVersionDate,
        dctStatus: parsedDoc.dctStatus,
        mlfId: parsedDoc.mlfId,
        mlfLabel: parsedDoc.mlfLabel,
        mlfName: parsedDoc.mlfName,
        assessmentTypeLabel: parsedDoc.assessmentTypeLabel,
        specialtyLabel: parsedDoc.specialtyLabel,
        peerGroupLabel: parsedDoc.peerGroupLabel,
        purpose: parsedDoc.purpose,
        objective: parsedDoc.objective,
        createdAt: now,
        updatedAt: now,
      });

      const questionsForInsert = parsedQs.map((q: any) => ({
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
        references: q.references ?? [],
        responses: q.responses ?? [],
      }));

      await insertQuestionsAndComparisonsForProjectDoc(ctx, {
        projectId,
        userId,
        dctDocumentId: docId,
        questions: questionsForInsert,
        now,
      });

      questionDelta += questionsForInsert.length;
      ingestedDocs++;
    }

    const newCachedCount = Math.max(0, (settings!.cachedQuestionCount ?? 0) + questionDelta);
    await ctx.db.patch(settings!._id, {
      lastXmlIngestAt: now,
      updatedAt: now,
      cachedQuestionCount: newCachedCount,
      cachedComparisonTotal: newCachedCount,
    });

    const summaryBits: string[] = [`Ingested ${ingestedDocs} DCT document(s) from parsed library`];
    if (skippedExisting) summaryBits.push(`skipped ${skippedExisting} already in project`);
    if (skippedNoCache) {
      summaryBits.push(
        `skipped ${skippedNoCache} without upload-time parse cache (re-upload DCT XML in Library)`,
      );
    }
    await ctx.db.patch(checkId, {
      completedAt: now,
      newOrUpdatedCount: ingestedDocs,
      summary: summaryBits.join("; "),
    });

    return {
      ingestedDocs,
      skippedExisting,
      skippedNoCache,
      questionDelta,
      revisionCheckId: checkId,
    };
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

export const upsertSettings = mutation({
  args: {
    projectId: v.id("projects"),
    scheduleIntervalDays: v.optional(v.number()),
    showAllDcts: v.optional(v.boolean()),
    includedPeerGroupSubstrings: v.optional(v.array(v.string())),
    excludedPeerGroupSubstrings: v.optional(v.array(v.string())),
    applicabilityMode: v.optional(v.union(v.literal("heuristics_only"), v.literal("structured_preferred"))),
    selectedClassRatingIds: v.optional(v.array(v.id("entityClassRatings"))),
    selectedCapabilityIds: v.optional(v.array(v.id("entityCapabilityList"))),
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
    if (args.applicabilityMode != null) patch.applicabilityMode = args.applicabilityMode;
    if (args.selectedClassRatingIds != null) patch.selectedClassRatingIds = args.selectedClassRatingIds;
    if (args.selectedCapabilityIds != null) patch.selectedCapabilityIds = args.selectedCapabilityIds;
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
      applicabilityMode: args.applicabilityMode ?? "structured_preferred",
      selectedClassRatingIds: args.selectedClassRatingIds,
      selectedCapabilityIds: args.selectedCapabilityIds,
      updatedAt: now,
    });
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
        severity: v.optional(
          v.union(
            v.literal("critical"),
            v.literal("major"),
            v.literal("minor"),
            v.literal("observation"),
          ),
        ),
        lowConfidenceApplicability: v.optional(v.boolean()),
        /**
         * Optional effective applicability the caller wants persisted. When provided,
         * this auto-accepts the applicability so filters and the matrix dropdown no
         * longer fall back to the inferred value on every render.
         */
        applicabilityState: v.optional(
          v.union(
            v.literal("applicable"),
            v.literal("unsure"),
            v.literal("not_applicable"),
          ),
        ),
        applicabilitySource: v.optional(v.string()),
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
      // Precedence: explicit applicabilityState from caller wins; otherwise
      // low-confidence → "unsure"; otherwise preserve existing DB value.
      const nextApplicability = r.applicabilityState
        ? r.applicabilityState
        : r.lowConfidenceApplicability
          ? "unsure"
          : row.applicabilityState;
      const nextSource = r.applicabilitySource
        ? r.applicabilitySource
        : r.applicabilityState
          ? "auto"
          : row.applicabilitySource;
      await ctx.db.patch(r.comparisonId, {
        status: r.status,
        underReviewDocumentId: r.underReviewDocumentId,
        evidenceSnippet: r.evidenceSnippet,
        rationale: r.rationale,
        severity: r.severity,
        applicabilityState: nextApplicability,
        applicabilitySource: nextSource,
        updatedAt: now,
        userId,
      });
      applied++;
    }
    return { applied };
  },
});

/**
 * Bulk edit for matrix rows — supports "Select all → Mark applicable / Mark
 * resolved / etc." actions. All four fields are optional so callers can target
 * a single property at a time. Silently skips rows from other projects.
 */
export const bulkSetMatrixFields = mutation({
  args: {
    projectId: v.id("projects"),
    comparisonIds: v.array(v.id("dctComparisons")),
    applicabilityState: v.optional(
      v.union(
        v.literal("applicable"),
        v.literal("unsure"),
        v.literal("not_applicable"),
      ),
    ),
    applicabilitySource: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("aligned"),
        v.literal("gap"),
        v.literal("mismatch"),
      ),
    ),
    severity: v.optional(
      v.union(
        v.literal("critical"),
        v.literal("major"),
        v.literal("minor"),
        v.literal("observation"),
      ),
    ),
    resolved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    let applied = 0;
    for (const id of args.comparisonIds) {
      const row = await ctx.db.get(id);
      if (!row || row.projectId !== args.projectId) continue;
      const patch: Record<string, unknown> = { updatedAt: now, userId };
      if (args.applicabilityState !== undefined) {
        patch.applicabilityState = args.applicabilityState;
        patch.applicabilitySource = args.applicabilitySource ?? "user";
      } else if (args.applicabilitySource !== undefined) {
        patch.applicabilitySource = args.applicabilitySource;
      }
      if (args.status !== undefined) patch.status = args.status;
      if (args.severity !== undefined) patch.severity = args.severity;
      if (args.resolved !== undefined) patch.resolved = args.resolved;
      await ctx.db.patch(id, patch);
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
    severity: v.optional(
      v.union(
        v.literal("critical"),
        v.literal("major"),
        v.literal("minor"),
        v.literal("observation"),
      ),
    ),
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
      severity: args.severity,
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
