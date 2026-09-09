/**
 * Project bundle: build one from a project, and insert one into a project.
 *
 * Shared by the manual export/import (convex/projects.ts) and the hosted →
 * desktop mirror (convex/mirror.ts). Authorisation is the caller's job.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isLocalReferenceCategory } from "../_helpers";
import { PROJECT_BUNDLE_SCOPE, PROJECT_BUNDLE_VERSION, shouldImportDocument } from "./projectBundle";

/** Everything the bundle carries about a project. Pure read. */
export async function buildProjectBundle(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");

  const [assessments, documents, analyses, simulationResults, documentRevisions, agentDocuments, entityIssues] =
    await Promise.all([
      ctx.db.query("assessments").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("documents").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("analyses").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("simulationResults").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("documentRevisions").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("projectAgentDocuments").withIndex("by_projectId_agentId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("entityIssues").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ]);

  return {
    version: PROJECT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    scope: PROJECT_BUNDLE_SCOPE,
    project: { name: project.name, description: project.description },
    assessments: assessments.map((a) => ({ originalId: a.originalId, data: a.data })),
    documents: documents.map((d) => {
      // Manufacturer-reference docs carry no text — export only the source pointer.
      if (isLocalReferenceCategory(d.category)) {
        return {
          category: d.category, name: d.name, source: d.source,
          mimeType: d.mimeType, path: d.path, contentHash: d.contentHash,
        };
      }
      return {
        category: d.category, name: d.name, source: d.source,
        mimeType: d.mimeType, extractedText: d.extractedText,
      };
    }),
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
}

export interface BundleInsertCounts {
  assessments: number;
  documents: number;
  documentsSkipped: number;
  analyses: number;
  simulationResults: number;
  documentRevisions: number;
  agentDocuments: number;
  entityIssues: number;
}

/**
 * Insert a bundle's contents into an existing project. INSERT ONLY; manuals,
 * logbooks and other excluded scopes are never read from the bundle.
 */
export async function insertProjectBundleContents(
  ctx: MutationCtx,
  options: { projectId: Id<"projects">; userId: string; bundle: Record<string, unknown>; now?: string },
): Promise<BundleInsertCounts> {
  const { projectId, userId, bundle } = options;
  const now = options.now ?? new Date().toISOString();

  const counts: BundleInsertCounts = {
    assessments: 0,
    documents: 0,
    documentsSkipped: 0,
    analyses: 0,
    simulationResults: 0,
    documentRevisions: 0,
    agentDocuments: 0,
    entityIssues: 0,
  };

  for (const assessment of (bundle.assessments as any[]) || []) {
    await ctx.db.insert("assessments", {
      projectId,
      userId,
      originalId: String(assessment.originalId || `assessment-${Date.now()}`),
      data: assessment.data ?? {},
      importedAt: now,
    });
    counts.assessments += 1;
  }

  for (const doc of (bundle.documents as any[]) || []) {
    const category = String(doc.category || "uploaded");
    if (!shouldImportDocument(category)) {
      counts.documentsSkipped += 1;
      continue;
    }
    await ctx.db.insert("documents", {
      projectId,
      userId,
      category,
      name: String(doc.name || "Document"),
      path: String(doc.path || doc.name || "imported"),
      source: String(doc.source || "imported"),
      mimeType: doc.mimeType,
      extractedText: doc.extractedText,
      contentHash: doc.contentHash,
      extractedAt: now,
    });
    counts.documents += 1;
  }

  for (const analysis of (bundle.analyses as any[]) || []) {
    await ctx.db.insert("analyses", {
      projectId,
      userId,
      assessmentId: String(analysis.assessmentId || "unknown"),
      companyName: String(analysis.companyName || "Unknown"),
      analysisDate: String(analysis.analysisDate || now),
      findings: analysis.findings ?? [],
      recommendations: analysis.recommendations ?? [],
      compliance: analysis.compliance ?? {
        overall: 0,
        criticalGaps: 0,
        majorGaps: 0,
        minorGaps: 0,
      },
      documentAnalyses: analysis.documentAnalyses,
      combinedInsights: analysis.combinedInsights,
    });
    counts.analyses += 1;
  }

  for (const sim of (bundle.simulationResults as any[]) || []) {
    await ctx.db.insert("simulationResults", {
      projectId,
      userId,
      originalId: String(sim.originalId || `sim-${Date.now()}`),
      name: String(sim.name || "Simulation"),
      assessmentId: String(sim.assessmentId || "unknown"),
      assessmentName: String(sim.assessmentName || "Unknown"),
      agentIds: Array.isArray(sim.agentIds) ? sim.agentIds : [],
      totalRounds: Number(sim.totalRounds) || 1,
      messages: sim.messages ?? [],
      createdAt: String(sim.createdAt || now),
      thinkingEnabled: Boolean(sim.thinkingEnabled),
      selfReviewMode: String(sim.selfReviewMode || "off"),
    });
    counts.simulationResults += 1;
  }

  for (const rev of (bundle.documentRevisions as any[]) || []) {
    await ctx.db.insert("documentRevisions", {
      projectId,
      userId,
      originalId: String(rev.originalId || `rev-${Date.now()}`),
      documentName: String(rev.documentName || "Document"),
      documentType: String(rev.documentType || "uploaded"),
      sourceDocumentId: String(rev.sourceDocumentId || rev.originalId || "unknown"),
      detectedRevision: String(rev.detectedRevision || "Unknown"),
      latestKnownRevision: String(rev.latestKnownRevision || "Unknown"),
      isCurrentRevision: rev.isCurrentRevision,
      searchSummary: String(rev.searchSummary || ""),
      status: String(rev.status || "unknown"),
    });
    counts.documentRevisions += 1;
  }

  for (const doc of (bundle.agentDocuments as any[]) || []) {
    await ctx.db.insert("projectAgentDocuments", {
      projectId,
      userId,
      agentId: String(doc.agentId || "unknown"),
      name: String(doc.name || "KB Document"),
      path: String(doc.path || doc.name || "kb"),
      source: String(doc.source || "imported"),
      mimeType: doc.mimeType,
      extractedText: doc.extractedText,
      extractedAt: now,
      region: "all",
    });
    counts.agentDocuments += 1;
  }

  for (const issue of (bundle.entityIssues as any[]) || []) {
    const source = issue.source;
    if (source === "manual" || source === "logbook_compliance") continue;
    await ctx.db.insert("entityIssues", {
      projectId,
      userId,
      source: source === "audit_sim" || source === "paperwork_review" || source === "analysis"
        ? source
        : "analysis",
      severity: issue.severity ?? "minor",
      title: String(issue.title || "Imported issue"),
      description: String(issue.description || ""),
      regulationRef: issue.regulationRef,
      status: issue.status ?? "open",
      carNumber: issue.carNumber,
      owner: issue.owner,
      dueDate: issue.dueDate,
      rootCauseCategory: issue.rootCauseCategory,
      rootCause: issue.rootCause,
      correctiveAction: issue.correctiveAction,
      preventiveAction: issue.preventiveAction,
      evidenceOfClosure: issue.evidenceOfClosure,
      closedAt: issue.closedAt,
      verifiedBy: issue.verifiedBy,
      externalId: issue.externalId,
      createdAt: String(issue.createdAt || now),
    });
    counts.entityIssues += 1;
  }

  return counts;
}

/**
 * Remove exactly what a project bundle would have inserted - and nothing else.
 * Manuals, logbooks, fleet, checklists and roster are outside the bundle's
 * scope and are left alone, so work done locally in those areas survives a
 * re-mirror. Storage blobs and search chunks of removed documents go with them.
 */
export async function clearProjectBundleContents(ctx: MutationCtx, projectId: Id<"projects">): Promise<void> {
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();
  for (const doc of documents) {
    for (const table of ["documentChunks", "documentIndexStatus"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    if (doc.storageId) await ctx.storage.delete(doc.storageId);
    if (doc.extractedTextStorageId) await ctx.storage.delete(doc.extractedTextStorageId);
    await ctx.db.delete(doc._id);
  }

  const agentDocs = await ctx.db
    .query("projectAgentDocuments")
    .withIndex("by_projectId_agentId", (q) => q.eq("projectId", projectId))
    .collect();
  for (const record of agentDocs) {
    if (record.storageId) await ctx.storage.delete(record.storageId);
    await ctx.db.delete(record._id);
  }

  for (const table of ["assessments", "analyses", "simulationResults", "documentRevisions", "entityIssues"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}
