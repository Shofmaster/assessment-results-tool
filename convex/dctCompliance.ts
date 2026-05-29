import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCompanyOrDelegatedSupportAccess, requireProjectOwner } from "./_helpers";
import { collectVisibleForCompany } from "./sharedReferenceDocuments";
import { computeDctComplianceStatus } from "./lib/dctStatus";
import {
  buildDctHaystack,
  classifyDctApplicability,
  type DctApplicabilityState,
  type EntityProfileLike,
  type StructuredApplicabilityInput,
} from "./lib/dctApplicability";
import {
  buildProjectMetricsRollup,
  roundCoveragePct,
  type ProjectMetricsRollup,
} from "./lib/dctProjectMetrics";
import {
  cleanDctProjectSettingsSelections,
  filterValidSelectedIds,
  sanitizeDctProjectSettingsSelections,
} from "./lib/dctSelectedIds";

/**
 * Resolve the entityProfile to use for DCT applicability evaluation.
 *
 * MUST mirror the write-side preference in `convex/entityOpSpecs.ts`
 * (`resolveProfileForProject`, `ensureProfileForCompany`): when the project has
 * a companyId, the **company-scoped** profile is authoritative. Admin opspec
 * writes land there, so eval has to read from there too. Falling back to a
 * project-scoped profile is for legacy/personal projects without a tenant.
 */
async function resolveProfileForEval(
  ctx: { db: any },
  projectId: Id<"projects">,
  projectDoc: Doc<"projects"> | null,
): Promise<Doc<"entityProfiles"> | null> {
  if (projectDoc?.companyId) {
    const byCompany = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", projectDoc.companyId))
      .first();
    if (byCompany) return byCompany;
  }
  return await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
}

/**
 * Load every active `entityOpSpecs` row that applies to this project.
 *
 * Queries by the `companyId` / `projectId` columns the row carries, NOT by
 * `entityProfileId` — because admin writes attach rows to the company profile
 * while a stray project-scoped profile may still exist for the same project.
 * Indexing both columns lets us read regardless of which profile owns the row,
 * and dedupes when both indexes return the same row.
 */
async function loadActiveOpspecsForProject(
  ctx: { db: any },
  projectId: Id<"projects">,
  projectDoc: Doc<"projects"> | null,
): Promise<Array<Doc<"entityOpSpecs">>> {
  const buckets: Array<Doc<"entityOpSpecs">>[] = [];
  if (projectDoc?.companyId) {
    buckets.push(
      await ctx.db
        .query("entityOpSpecs")
        .withIndex("by_companyId", (q: any) => q.eq("companyId", projectDoc.companyId))
        .collect(),
    );
  }
  buckets.push(
    await ctx.db
      .query("entityOpSpecs")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .collect(),
  );
  const seen = new Set<string>();
  const out: Array<Doc<"entityOpSpecs">> = [];
  for (const row of buckets.flat()) {
    const id = String(row._id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (row.isActive) out.push(row);
  }
  return out;
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

/** Load applicability context (profile, opspec tokens, structured ratings) for metrics. */
async function loadApplicabilityEvalContext(
  ctx: { db: any },
  projectId: Id<"projects">,
  projectDoc: Doc<"projects"> | null,
  settings: Doc<"dctProjectSettings"> | null,
): Promise<{
  profile: EntityProfileLike | null;
  opspecExtraTokens: string[] | null;
  structured: StructuredApplicabilityInput;
  applicabilitySettings: {
    showAllDcts?: boolean;
    includedPeerGroupSubstrings?: string[];
    excludedPeerGroupSubstrings?: string[];
    applicabilityMode?: "heuristics_only" | "structured_preferred";
  };
}> {
  const profileDoc = await resolveProfileForEval(ctx, projectId, projectDoc);
  const profile: EntityProfileLike | null = profileDoc
    ? {
        repairStationType: profileDoc.repairStationType,
        operationsScope: profileDoc.operationsScope,
        certifications: profileDoc.certifications,
        hasSms: profileDoc.hasSms,
        smsMaturity: profileDoc.smsMaturity,
        faaCertTypesHeld: profileDoc.faaCertTypesHeld,
      }
    : null;

  let opspecExtraTokens: string[] | null = null;
  const activeOpspecs = await loadActiveOpspecsForProject(ctx, projectId, projectDoc);
  if (activeOpspecs.length > 0) {
    const tokenSet = new Set<string>();
    for (const row of activeOpspecs as any[]) {
      if (row.paragraph) tokenSet.add(String(row.paragraph).toLowerCase());
      if (row.title) {
        const norm = String(row.title).toLowerCase();
        tokenSet.add(norm);
        for (const part of norm.split(/[,/()\n]/)) {
          const phrase = part
            .replace(/\band\b|\bthe\b|\bto\b|\buse\b|\ba\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (phrase.length > 4) tokenSet.add(phrase);
        }
      }
    }
    opspecExtraTokens = [...tokenSet];
  }

  const selectedRatingIds = (settings?.selectedClassRatingIds ?? []) as Id<"entityClassRatings">[];
  const selectedCapabilityIds = (settings?.selectedCapabilityIds ?? []) as Id<"entityCapabilityList">[];
  const [ratingRows, capabilityRows] = await Promise.all([
    Promise.all(selectedRatingIds.map((id) => ctx.db.get(id))),
    Promise.all(selectedCapabilityIds.map((id) => ctx.db.get(id))),
  ]);
  const structured: StructuredApplicabilityInput = {
    selectedRatings: ratingRows
      .filter((r): r is Doc<"entityClassRatings"> => !!r)
      .map((r) => ({
        normalizedTokens: r.normalizedTokens,
        category: r.category,
        classNumber: r.classNumber,
        authority: r.authority,
      })),
    selectedCapabilities: capabilityRows
      .filter((c): c is Doc<"entityCapabilityList"> => !!c)
      .map((c) => ({
        normalizedTokens: c.normalizedTokens,
        articleDescription: c.articleDescription,
        authority: c.authority,
      })),
  };

  return {
    profile,
    opspecExtraTokens,
    structured,
    applicabilitySettings: {
      showAllDcts: settings?.showAllDcts,
      includedPeerGroupSubstrings: settings?.includedPeerGroupSubstrings,
      excludedPeerGroupSubstrings: settings?.excludedPeerGroupSubstrings,
      applicabilityMode: settings?.applicabilityMode,
    },
  };
}

/**
 * Full-project metrics: status + inferred applicability + open findings.
 * One source of truth for hero cards, overview breakdown, and reports.
 */
async function computeProjectMetrics(
  ctx: { db: any },
  projectId: Id<"projects">,
): Promise<
  ProjectMetricsRollup & {
    showAllDcts: boolean;
    coverageTarget: number;
    belowCoverageTarget: boolean;
    coveragePct: number;
  }
> {
  // Keep summary metrics under Convex's read limit for very large projects.
  // Worst case is ~3 reads per comparison (comparison + question + document).
  // Keep this low enough for Convex deployments that still enforce 4096 reads.
  // Worst-case path reads comparisons + questions + docs (~3x cap).
  const METRICS_COMPARISON_CAP = 1000;
  const settings = await ctx.db
    .query("dctProjectSettings")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
  const projectDoc = await ctx.db.get(projectId);
  const { profile, opspecExtraTokens, structured, applicabilitySettings } =
    await loadApplicabilityEvalContext(ctx, projectId, projectDoc, settings);

  const comparisons = await ctx.db
    .query("dctComparisons")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .take(METRICS_COMPARISON_CAP);

  const questionIds = [
    ...new Set(
      comparisons
        .filter((c: Doc<"dctComparisons">) => !c.applicabilityState)
        .map((c: Doc<"dctComparisons">) => String(c.questionId)),
    ),
  ] as unknown as Id<"dctQuestions">[];
  const questions = await Promise.all(questionIds.map((id) => ctx.db.get(id)));
  const questionById = new Map<string, Doc<"dctQuestions">>();
  for (const q of questions) if (q) questionById.set(String(q._id), q);

  const docIds = [
    ...new Set(
      questions
        .filter((q): q is Doc<"dctQuestions"> => !!q)
        .map((q) => String(q.dctDocumentId)),
    ),
  ] as unknown as Id<"dctToolDocuments">[];
  const docs = await Promise.all(docIds.map((id) => ctx.db.get(id)));
  const docById = new Map<string, Doc<"dctToolDocuments">>();
  for (const d of docs) if (d) docById.set(String(d._id), d);

  const metricRows: Array<{
    status: Doc<"dctComparisons">["status"];
    resolved?: boolean;
    applicability: DctApplicabilityState;
  }> = [];

  for (const c of comparisons) {
    const q = questionById.get(String(c.questionId));
    const d = q ? docById.get(String(q.dctDocumentId)) : undefined;
    let applicability: DctApplicabilityState;
    if (c.applicabilityState) {
      applicability = c.applicabilityState as DctApplicabilityState;
    } else if (d && q) {
      applicability = classifyDctApplicability(
        d.peerGroupLabel,
        d.mlfLabel,
        d.specialtyLabel,
        profile,
        applicabilitySettings,
        opspecExtraTokens,
        structured,
        buildDctHaystack(d, q),
      ).state;
    } else {
      applicability = "unsure";
    }
    metricRows.push({
      status: c.status,
      resolved: c.resolved,
      applicability,
    });
  }

  const rollup = buildProjectMetricsRollup(metricRows);
  const coverageTarget = 0.06;
  const showAllDcts = settings?.showAllDcts === true;
  return {
    ...rollup,
    showAllDcts,
    coverageTarget,
    belowCoverageTarget: rollup.applicabilityCoverage < coverageTarget,
    coveragePct: roundCoveragePct(rollup.applicabilityCoverage),
  };
}

export const getProjectMetrics = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    return await computeProjectMetrics(ctx, projectId);
  },
});

export const getSummary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const settingsRow = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .first();
    const settings = await sanitizeDctProjectSettingsSelections(ctx, settingsRow);
    const projectDoc = await ctx.db.get(projectId);
    const profile = await resolveProfileForEval(ctx, projectId, projectDoc);
    const docs = await ctx.db
      .query("dctToolDocuments")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    const questionCount = settings?.cachedQuestionCount ?? 0;
    const metrics = await computeProjectMetrics(ctx, projectId);
    const status = computeDctComplianceStatus({
      lastCheckCompletedAt: settings?.lastCheckCompletedAt,
      nextDueAt: settings?.nextDueAt,
      unresolvedGapOrMismatch: metrics.openFindings,
    });
    const overdue =
      !!settings?.nextDueAt && new Date(settings.nextDueAt).getTime() < Date.now();
    return {
      projectId,
      settings,
      profile,
      docCount: docs.length,
      questionCount,
      metrics,
      comparisonStats: {
        unresolvedGapOrMismatch: metrics.openFindings,
        pending: metrics.status.pending,
        total: metrics.totalComparisons,
        applicableCount: metrics.applicability.applicable,
        unsureCount: metrics.applicability.unsure,
        notApplicableCount: metrics.applicability.notApplicable,
        totalCandidateDcts: metrics.totalComparisons,
        applicableCoverage: metrics.applicabilityCoverage,
        coverageTarget: metrics.coverageTarget,
        belowCoverageTarget: metrics.belowCoverageTarget,
        coveragePct: metrics.coveragePct,
        showAllDcts: metrics.showAllDcts,
        status: metrics.status,
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
     *  Convex's per-function read limit is 4096 (NOT 16 384 — that figure in earlier
     *  comments was wrong). Cap at 1300 → ≤3900 reads, leaves headroom for the outer
     *  query overhead. Projects with more comparisons silently truncate until we land
     *  proper pagination. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, limit }) => {
    await requireProjectOwner(ctx, projectId);
    const cap = Math.min(limit ?? 1300, 1300);
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
    let existing = await ctx.db
      .query("dctProjectSettings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();
    if (existing) {
      const cleaned = await cleanDctProjectSettingsSelections(ctx, existing);
      if (cleaned.didPrune) {
        existing = (await ctx.db.get(existing._id)) ?? existing;
      }
    }
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

    let prunedRatingIds: Id<"entityClassRatings">[] = [];
    let prunedCapabilityIds: Id<"entityCapabilityList">[] = [];
    const requestedRatingCount =
      args.selectedClassRatingIds != null ? args.selectedClassRatingIds.length : undefined;
    const requestedCapabilityCount =
      args.selectedCapabilityIds != null ? args.selectedCapabilityIds.length : undefined;

    if (args.selectedClassRatingIds != null) {
      const filtered = await filterValidSelectedIds(ctx, args.selectedClassRatingIds, []);
      patch.selectedClassRatingIds = filtered.validRatingIds;
      prunedRatingIds = filtered.prunedRatingIds;
      if (prunedRatingIds.length > 0) {
        console.warn("[dctCompliance] Pruned invalid rating IDs on save", { prunedRatingIds });
      }
    }
    if (args.selectedCapabilityIds != null) {
      const filtered = await filterValidSelectedIds(ctx, [], args.selectedCapabilityIds);
      patch.selectedCapabilityIds = filtered.validCapabilityIds;
      prunedCapabilityIds = filtered.prunedCapabilityIds;
      if (prunedCapabilityIds.length > 0) {
        console.warn("[dctCompliance] Pruned invalid capability IDs on save", {
          prunedCapabilityIds,
        });
      }
    }

    let settingsId: Id<"dctProjectSettings">;
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      settingsId = existing._id;
    } else {
      settingsId = await ctx.db.insert("dctProjectSettings", {
        projectId: args.projectId,
        userId,
        scheduleIntervalDays: args.scheduleIntervalDays ?? 7,
        showAllDcts: args.showAllDcts ?? false,
        includedPeerGroupSubstrings: args.includedPeerGroupSubstrings,
        excludedPeerGroupSubstrings: args.excludedPeerGroupSubstrings,
        applicabilityMode: args.applicabilityMode ?? "structured_preferred",
        selectedClassRatingIds: (patch.selectedClassRatingIds as Id<"entityClassRatings">[] | undefined) ??
          args.selectedClassRatingIds,
        selectedCapabilityIds: (patch.selectedCapabilityIds as Id<"entityCapabilityList">[] | undefined) ??
          args.selectedCapabilityIds,
        updatedAt: now,
      });
    }

    const storedRow = await ctx.db.get(settingsId);
    const storedRatingIds = storedRow?.selectedClassRatingIds ?? [];
    const storedCapabilityIds = storedRow?.selectedCapabilityIds ?? [];

    // Kick off applicability re-eval so the dashboard reflects the new filters.
    await ctx.scheduler.runAfter(
      0,
      internal.dctCompliance.reevaluateApplicabilityForProject,
      { projectId: args.projectId },
    );

    return {
      settingsId,
      selectedClassRatingIds: storedRatingIds,
      selectedCapabilityIds: storedCapabilityIds,
      showAllDcts: storedRow?.showAllDcts,
      includedPeerGroupSubstrings: storedRow?.includedPeerGroupSubstrings,
      excludedPeerGroupSubstrings: storedRow?.excludedPeerGroupSubstrings,
      applicabilityMode: storedRow?.applicabilityMode,
      updatedAt: storedRow?.updatedAt,
      prunedRatingIds,
      prunedCapabilityIds,
      requestedRatingCount,
      requestedCapabilityCount,
    };
  },
});

/**
 * Re-stamp `applicabilityState` on every project comparison whose
 * `applicabilitySource` isn't `'user'`, using the current settings/profile/ratings.
 * Returns diagnostic counts (opspecs/ratings used, rows skipped, bucket distribution)
 * so callers can surface "why didn't anything change?" to the user. Shared body for
 * the scheduled (`reevaluateApplicabilityForProject`) and user-triggered
 * (`refreshApplicability`) entry points.
 */
async function runApplicabilityReeval(
  ctx: { db: any },
  projectId: Id<"projects">,
): Promise<{
  evaluated: number;
  changed: number;
  skippedUserSource: number;
  comparisonCount: number;
  opspecCount: number;
  ratingCount: number;
  capabilityCount: number;
  profileSource: "company" | "project" | "none";
  applicabilityMode: string;
  buckets: { applicable: number; unsure: number; not_applicable: number };
}> {
  const settings = await ctx.db
    .query("dctProjectSettings")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
  const projectDoc = await ctx.db.get(projectId);
  const profileDoc = await resolveProfileForEval(ctx, projectId, projectDoc);
  const profileSource: "company" | "project" | "none" = profileDoc
    ? profileDoc.companyId
      ? "company"
      : "project"
    : "none";

    const profile: EntityProfileLike | null = profileDoc
      ? {
          repairStationType: profileDoc.repairStationType,
          operationsScope: profileDoc.operationsScope,
          certifications: profileDoc.certifications,
          hasSms: profileDoc.hasSms,
          smsMaturity: profileDoc.smsMaturity,
          faaCertTypesHeld: profileDoc.faaCertTypesHeld,
        }
      : null;

    // Build extra tokens from active opspecs so that, e.g., A025 (digital signatures)
    // causes DCTs with matching labels to be classified as applicable.
    // Load by company/project columns, not entityProfileId — admin writes land on the
    // company profile, but a stray project-scoped profile may still exist for the same
    // project. Querying the columns side-steps that mismatch.
    let opspecExtraTokens: string[] | null = null;
    const activeOpspecs = await loadActiveOpspecsForProject(ctx, projectId, projectDoc);
    if (activeOpspecs.length > 0) {
      const tokenSet = new Set<string>();
      for (const row of activeOpspecs as any[]) {
        if (row.paragraph) tokenSet.add(String(row.paragraph).toLowerCase());
        if (row.title) {
          const norm = String(row.title).toLowerCase();
          tokenSet.add(norm);
          for (const part of norm.split(/[,/()\n]/)) {
            const phrase = part
              .replace(/\band\b|\bthe\b|\bto\b|\buse\b|\ba\b/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (phrase.length > 4) tokenSet.add(phrase);
          }
        }
      }
      opspecExtraTokens = [...tokenSet];
    }

    const selectedRatingIds = (settings?.selectedClassRatingIds ?? []) as Id<"entityClassRatings">[];
    const selectedCapabilityIds = (settings?.selectedCapabilityIds ?? []) as Id<"entityCapabilityList">[];
    const [ratingRows, capabilityRows] = await Promise.all([
      Promise.all(selectedRatingIds.map((id) => ctx.db.get(id))),
      Promise.all(selectedCapabilityIds.map((id) => ctx.db.get(id))),
    ]);
    const structured: StructuredApplicabilityInput = {
      selectedRatings: ratingRows
        .filter((r): r is Doc<"entityClassRatings"> => !!r)
        .map((r) => ({
          normalizedTokens: r.normalizedTokens,
          category: r.category,
          classNumber: r.classNumber,
          authority: r.authority,
        })),
      selectedCapabilities: capabilityRows
        .filter((c): c is Doc<"entityCapabilityList"> => !!c)
        .map((c) => ({
          normalizedTokens: c.normalizedTokens,
          articleDescription: c.articleDescription,
          authority: c.authority,
        })),
    };

    // Bounded to stay under Convex's 4 096-read per-function limit. Each comparison
    // costs 1 read here + 1 for its question + (occasionally) 1 for its doc, so the
    // total read budget for this section is ~2 * cap + opspecs/ratings overhead.
    // 1 500 → ~3 100 reads with headroom. Larger projects truncate; follow-up work
    // is to chain via scheduler for full coverage.
    const REEVAL_CAP = 1500;
    const comparisons = await ctx.db
      .query("dctComparisons")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .take(REEVAL_CAP);

    const questionIds = [
      ...new Set(comparisons.map((c: any) => String(c.questionId))),
    ] as unknown as Id<"dctQuestions">[];
    const questions = await Promise.all(questionIds.map((id) => ctx.db.get(id)));
    const questionById = new Map<string, Doc<"dctQuestions">>();
    for (const q of questions) if (q) questionById.set(String(q._id), q);

    const docIds = [
      ...new Set(
        questions
          .filter((q): q is Doc<"dctQuestions"> => !!q)
          .map((q) => String(q.dctDocumentId)),
      ),
    ] as unknown as Id<"dctToolDocuments">[];
    const docs = await Promise.all(docIds.map((id) => ctx.db.get(id)));
    const docById = new Map<string, Doc<"dctToolDocuments">>();
    for (const d of docs) if (d) docById.set(String(d._id), d);

    const now = new Date().toISOString();
    let evaluated = 0;
    let changed = 0;
    let skippedUserSource = 0;
    const buckets = { applicable: 0, unsure: 0, not_applicable: 0 };
    for (const c of comparisons) {
      // Preserve user-confirmed applicability AND applicability that was set by
      // a traceability run (the AI has read the actual manuals — its judgement
      // should outrank the coarse heuristic that runs on every settings save).
      if (
        c.applicabilitySource === "user" ||
        c.applicabilitySource === "traceability"
      ) {
        skippedUserSource++;
        const stored = (c.applicabilityState ?? "not_applicable") as DctApplicabilityState;
        buckets[stored]++;
        continue;
      }
      const q = questionById.get(String(c.questionId));
      if (!q) continue;
      const d = docById.get(String(q.dctDocumentId));
      if (!d) continue;
      evaluated++;
      const inferred = classifyDctApplicability(
        d.peerGroupLabel,
        d.mlfLabel,
        d.specialtyLabel,
        profile,
        {
          showAllDcts: settings?.showAllDcts,
          includedPeerGroupSubstrings: settings?.includedPeerGroupSubstrings,
          excludedPeerGroupSubstrings: settings?.excludedPeerGroupSubstrings,
          applicabilityMode: settings?.applicabilityMode,
        },
        opspecExtraTokens,
        structured,
        buildDctHaystack(d, q),
      );
      const next: DctApplicabilityState = inferred.state;
      buckets[next]++;
      if (c.applicabilityState !== next || c.applicabilitySource !== "auto") {
        await ctx.db.patch(c._id, {
          applicabilityState: next,
          applicabilitySource: "auto",
          updatedAt: now,
        });
        changed++;
      }
    }
    return {
      evaluated,
      changed,
      skippedUserSource,
      comparisonCount: comparisons.length,
      opspecCount: activeOpspecs.length,
      ratingCount: structured.selectedRatings?.length ?? 0,
      capabilityCount: structured.selectedCapabilities?.length ?? 0,
      profileSource,
      applicabilityMode: settings?.applicabilityMode ?? "structured_preferred",
      buckets,
    };
}

export const reevaluateApplicabilityForProject = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await runApplicabilityReeval(ctx, projectId);
  },
});

/** User-triggered re-stamp: runs inline (not via scheduler) so the response
 * carries diagnostic counts the UI can show in a toast. For 5 000 comparisons
 * this stays within Convex's per-mutation read/write budget. */
export const refreshApplicability = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    return await runApplicabilityReeval(ctx, projectId);
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
    let missing = 0;
    let mismatched = 0;
    for (const r of results) {
      const row = await ctx.db.get(r.comparisonId);
      if (!row) {
        missing++;
        console.warn(
          "[bulkApplyTraceabilityResults] comparison not found",
          String(r.comparisonId),
        );
        continue;
      }
      if (row.projectId !== projectId) {
        mismatched++;
        console.warn("[bulkApplyTraceabilityResults] projectId mismatch", {
          comparisonId: String(r.comparisonId),
          rowProject: String(row.projectId),
          runProject: String(projectId),
        });
        continue;
      }
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
          ? "traceability"
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
    return { applied, missing, mismatched, sent: results.length };
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
    const metrics = await computeProjectMetrics(ctx, projectId);
    const status = computeDctComplianceStatus({
      lastCheckCompletedAt: now,
      nextDueAt,
      unresolvedGapOrMismatch: metrics.openFindings,
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

/* ─────────────────────────────────────────────────────────────────────────────
 * Server-orchestrated traceability runs (dctTraceabilityRuns)
 *
 * The action `dctTraceabilityRunner.startTraceabilityRun` owns the batch loop.
 * These helpers expose lifecycle CRUD: the action calls the internal ones,
 * and the UI watches `getActiveTraceabilityRun` + writes `cancelTraceabilityRun`.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Internal: create the run row at action start; user identity flows in from the action's auth context. */
const traceabilityRunPayloadValidator = v.object({
  comparisonIds: v.array(v.id("dctComparisons")),
  docIds: v.array(v.id("documents")),
  systemPrompt: v.string(),
  corpus: v.string(),
  batchSize: v.number(),
  applicabilityByComparisonId: v.optional(
    v.array(
      v.object({
        comparisonId: v.string(),
        applicability: v.union(
          v.literal("applicable"),
          v.literal("unsure"),
          v.literal("not_applicable"),
        ),
      }),
    ),
  ),
  lowConfidenceByComparisonId: v.optional(
    v.array(
      v.object({
        comparisonId: v.string(),
        value: v.boolean(),
      }),
    ),
  ),
});

export const _createTraceabilityRun = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    total: v.number(),
    model: v.string(),
    agentId: v.string(),
    runPayload: traceabilityRunPayloadValidator,
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("dctTraceabilityRuns", {
      projectId: args.projectId,
      userId: args.userId,
      status: "queued",
      total: args.total,
      processed: 0,
      persisted: 0,
      persistFailed: 0,
      parseFailed: 0,
      model: args.model,
      agentId: args.agentId,
      startedAt: now,
      lastHeartbeatAt: now,
      runPayload: args.runPayload,
    });
  },
});

/** Fail in-flight runs that lost their action worker (Convex 10 min action cap). */
export const _failStaleTraceabilityRunsForProject = internalMutation({
  args: { projectId: v.id("projects"), exceptRunId: v.optional(v.id("dctTraceabilityRuns")) },
  handler: async (ctx, { projectId, exceptRunId }) => {
    const staleMs = 12 * 60 * 1000;
    const now = Date.now();
    const rows = await ctx.db
      .query("dctTraceabilityRuns")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    for (const row of rows) {
      if (exceptRunId && row._id === exceptRunId) continue;
      if (row.status !== "queued" && row.status !== "running") continue;
      const heartbeat = new Date(row.lastHeartbeatAt).getTime();
      if (now - heartbeat < staleMs) continue;
      await ctx.db.patch(row._id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error:
          "Run stopped responding (server time limit). Cancel and start a new run — large jobs now continue automatically in chunks.",
      });
    }
  },
});

/** Internal: patch progress / status during a run. All fields optional so callers patch only what changed. */
export const _updateTraceabilityRun = internalMutation({
  args: {
    runId: v.id("dctTraceabilityRuns"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    processed: v.optional(v.number()),
    persisted: v.optional(v.number()),
    persistFailed: v.optional(v.number()),
    parseFailed: v.optional(v.number()),
    completedAt: v.optional(v.string()),
    error: v.optional(v.string()),
    lastBadResponse: v.optional(v.string()),
    /** Bump the consecutive-stall counter (set on a retry that made no progress). */
    incrementStall: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.runId);
    if (!existing) return;
    const patch: Record<string, unknown> = { lastHeartbeatAt: new Date().toISOString() };
    const prevStall = (existing as unknown as { stallRetries?: number }).stallRetries ?? 0;
    // Real forward progress clears the stall counter; a non-advancing retry bumps it.
    if (args.processed !== undefined && args.processed > existing.processed) {
      patch.stallRetries = 0;
    } else if (args.incrementStall) {
      patch.stallRetries = prevStall + 1;
    }
    const cancelled =
      existing.status === "cancelled" || existing.cancelRequested === true;
    if (args.status !== undefined) {
      // A cancelled run must not be resurrected to running/completed by a late chunk.
      if (cancelled && args.status !== "cancelled" && args.status !== "failed") {
        // omit status patch
      } else {
        patch.status = args.status;
      }
    }
    if (args.processed !== undefined) patch.processed = args.processed;
    if (args.persisted !== undefined) patch.persisted = args.persisted;
    if (args.persistFailed !== undefined) patch.persistFailed = args.persistFailed;
    if (args.parseFailed !== undefined) patch.parseFailed = args.parseFailed;
    if (args.completedAt !== undefined && !cancelled) patch.completedAt = args.completedAt;
    if (args.error !== undefined) patch.error = args.error;
    // Only record the FIRST bad response per run so the UI shows what initially failed.
    // Cast through unknown: `convex codegen` regenerates this field's type on next
    // `convex dev` run; this keeps the file compilable in the meantime.
    if (
      args.lastBadResponse !== undefined &&
      !(existing as unknown as { lastBadResponse?: string }).lastBadResponse
    ) {
      patch.lastBadResponse = args.lastBadResponse;
    }
    await ctx.db.patch(args.runId, patch);
  },
});

/** Internal: read the run row (used by the action to poll cancelRequested). */
export const _getTraceabilityRun = internalQuery({
  args: { runId: v.id("dctTraceabilityRuns") },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
});

/**
 * Public: user clicks Cancel. Marks the run cancelled immediately for the UI;
 * any in-flight chunk stops scheduling follow-ups and exits on its next check.
 */
/** Re-queue processing when a run is stuck (no heartbeat) but still marked running. */
export const resumeTraceabilityRun = mutation({
  args: { runId: v.id("dctTraceabilityRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("Traceability run not found.");
    await requireProjectOwner(ctx, run.projectId);
    if (run.status === "completed" || run.status === "cancelled") {
      return;
    }
    if (run.cancelRequested) {
      throw new Error("Run was cancelled — start a new traceability run.");
    }
    if (run.processed >= run.total) {
      await ctx.db.patch(runId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      });
      return;
    }
    await ctx.db.patch(runId, {
      status: "running",
      lastHeartbeatAt: new Date().toISOString(),
    });
    await ctx.scheduler.runAfter(0, internal.dctTraceabilityRunner.processTraceabilityBatch, {
      runId,
    });
  },
});

export const cancelTraceabilityRun = mutation({
  args: { runId: v.id("dctTraceabilityRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("Traceability run not found.");
    await requireProjectOwner(ctx, run.projectId);
    if (
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "cancelled"
    ) {
      return;
    }
    const now = new Date().toISOString();
    await ctx.db.patch(runId, {
      cancelRequested: true,
      status: "cancelled",
      completedAt: now,
      lastHeartbeatAt: now,
    });
  },
});

/**
 * Public: UI watches this to render live progress. Returns the most recent
 * non-finalized run for the project, or — if none in flight — the most recent
 * finalized run so the UI can still show "last run: X applied".
 */
export const getActiveTraceabilityRun = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const rows = await ctx.db
      .query("dctTraceabilityRuns")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    const inFlight = rows.filter(
      (r) =>
        (r.status === "queued" || r.status === "running") && r.cancelRequested !== true,
    );
    const pick = inFlight.length > 0 ? inFlight : rows;
    if (pick.length === 0) return null;
    const row = pick.sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
    )[0];
    // Legacy rows: cancelRequested set before immediate-cancel deploy left status "running".
    if (row.cancelRequested && (row.status === "queued" || row.status === "running")) {
      return { ...row, status: "cancelled" as const };
    }
    return row;
  },
});
