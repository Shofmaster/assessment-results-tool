import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireProjectOwner } from "./_helpers";

export const exportBundle = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const [assessments, documents, analyses, simulationResults, documentRevisions, agentDocuments] =
      await Promise.all([
        ctx.db.query("assessments").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("documents").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("analyses").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("simulationResults").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("documentRevisions").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("projectAgentDocuments").withIndex("by_projectId_agentId", (q) => q.eq("projectId", args.projectId)).collect(),
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
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      userId,
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
