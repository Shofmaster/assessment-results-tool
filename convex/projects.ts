import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireCompanyRole, requireProjectOwner } from "./_helpers";

export const exportBundle = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const [assessments, documents, analyses, simulationResults, documentRevisions, agentDocuments, entityIssues] =
      await Promise.all([
        ctx.db.query("assessments").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("documents").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("analyses").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("simulationResults").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("documentRevisions").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("projectAgentDocuments").withIndex("by_projectId_agentId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("entityIssues").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
      ]);

    return {
      version: "2.0.0",
      exportedAt: new Date().toISOString(),
      project: { name: project.name, description: project.description },
      assessments: assessments.map((a) => ({ originalId: a.originalId, data: a.data })),
      documents: documents.map((d) => ({
        category: d.category, name: d.name, source: d.source,
        mimeType: d.mimeType, extractedText: d.extractedText,
      })),
      analyses: analyses.map((a) => ({
        assessmentId: a.assessmentId, companyName: a.companyName,
        analysisDate: a.analysisDate, findings: a.findings,
        recommendations: a.recommendations, compliance: a.compliance,
        documentAnalyses: a.documentAnalyses, combinedInsights: a.combinedInsights,
      })),
      simulationResults: simulationResults.map((s) => ({
        originalId: s.originalId, name: s.name,
        assessmentId: s.assessmentId, assessmentName: s.assessmentName,
        agentIds: s.agentIds, totalRounds: s.totalRounds,
        messages: s.messages, createdAt: s.createdAt,
        thinkingEnabled: s.thinkingEnabled, selfReviewMode: s.selfReviewMode,
      })),
      documentRevisions: documentRevisions.map((r) => ({
        originalId: r.originalId, documentName: r.documentName,
        documentType: r.documentType, sourceDocumentId: r.sourceDocumentId,
        detectedRevision: r.detectedRevision, latestKnownRevision: r.latestKnownRevision,
        isCurrentRevision: r.isCurrentRevision, status: r.status,
        searchSummary: r.searchSummary,
      })),
      agentDocuments: agentDocuments.map((d) => ({
        agentId: d.agentId, name: d.name, source: d.source,
        mimeType: d.mimeType, extractedText: d.extractedText,
      })),
      entityIssues: entityIssues.map((issue) => ({
        externalId: issue.externalId,
        carNumber: issue.carNumber,
        source: issue.source,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        regulationRef: issue.regulationRef,
        status: issue.status,
        owner: issue.owner,
        dueDate: issue.dueDate,
        rootCauseCategory: issue.rootCauseCategory,
        rootCause: issue.rootCause,
        correctiveAction: issue.correctiveAction,
        preventiveAction: issue.preventiveAction,
        evidenceOfClosure: issue.evidenceOfClosure,
        closedAt: issue.closedAt,
        verifiedBy: issue.verifiedBy,
        createdAt: issue.createdAt,
      })),
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .first();

    if (user?.role === "admin" || user?.role === "aerogap_employee") {
      return await ctx.db.query("projects").collect();
    }

    const personal = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const [memberships, supportAssignments] = await Promise.all([
      ctx.db.query("companyMemberships").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db
        .query("companySupportAssignments")
        .withIndex("by_supportUserId", (q) => q.eq("supportUserId", userId))
        .collect(),
    ]);

    const companyIds = new Set<string>();
    memberships
      .filter((m) => m.status !== "suspended")
      .forEach((m) => companyIds.add(m.companyId));
    supportAssignments
      .filter((a) => a.isActive)
      .forEach((a) => companyIds.add(a.companyId));

    const companyProjectsNested = await Promise.all(
      Array.from(companyIds).map((companyId) =>
        ctx.db
          .query("projects")
          .withIndex("by_companyId", (q) => q.eq("companyId", companyId as any))
          .collect()
      )
    );

    const merged = [...personal, ...companyProjectsNested.flat()];
    const uniqueById = new Map(merged.map((project) => [project._id, project]));
    return Array.from(uniqueById.values());
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db.get(args.projectId);
  },
});

export const getInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    if (args.companyId) {
      await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    }
    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      userId,
      companyId: args.companyId,
      name: args.name,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.projectId, updates);
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);

    // Cascade delete all child records
    const tables = [
      "assessments",
      "documents",
      "analyses",
      "simulationResults",
      "documentRevisions",
      "projectAgentDocuments",
      "entityIssues",
      "entityProfiles",
      "auditChecklistRuns",
      "auditChecklistItems",
      "checklistCustomTemplates",
      "manualSections",
      "manuals",
      "inspectionScheduleItems",
      "aircraftAssets",
      "logbookDraftEntries",
      "logbookEntries",
      "form337Records",
      "complianceFindings",
      "rosterRequirementTypes",
      "rosterPersonnel",
      "rosterAssignments",
    ] as const;

    for (const table of tables) {
      switch (table) {
        case "projectAgentDocuments": {
          const records = await ctx.db
            .query("projectAgentDocuments")
            .withIndex("by_projectId_agentId", (q) =>
              q.eq("projectId", args.projectId)
            )
            .collect();
          for (const record of records) {
            if (record.storageId) {
              await ctx.storage.delete(record.storageId);
            }
            await ctx.db.delete(record._id);
          }
          break;
        }
        default: {
          const records = await ctx.db
            .query(table)
            .withIndex("by_projectId", (q) =>
              q.eq("projectId", args.projectId)
            )
            .collect();
          for (const record of records) {
            if ("storageId" in record && record.storageId) {
              await ctx.storage.delete(record.storageId as any);
            }
            await ctx.db.delete(record._id);
          }
        }
      }
    }

    await ctx.db.delete(args.projectId);
  },
});
