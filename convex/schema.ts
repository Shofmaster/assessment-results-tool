import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
    role: v.string(), // "user" | "admin"
    createdAt: v.string(),
    lastSignInAt: v.string(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"]),

  projects: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"]),

  assessments: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    originalId: v.string(), // preserves client-side UUID
    data: v.any(), // AssessmentData
    importedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  documents: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    category: v.string(), // "uploaded" | "regulatory" | "entity"
    name: v.string(),
    path: v.string(),
    source: v.string(), // "local" | "google-drive"
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    extractedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_category", ["projectId", "category"]),

  analyses: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    assessmentId: v.string(),
    companyName: v.string(),
    analysisDate: v.string(),
    findings: v.any(), // Finding[]
    recommendations: v.any(), // Recommendation[]
    compliance: v.any(), // ComplianceStatus
    documentAnalyses: v.optional(v.any()),
    combinedInsights: v.optional(v.any()),
  }).index("by_projectId", ["projectId"]),

  simulationResults: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    originalId: v.string(),
    name: v.string(),
    assessmentId: v.string(),
    assessmentName: v.string(),
    agentIds: v.array(v.string()),
    totalRounds: v.number(),
    messages: v.any(), // AuditMessage[]
    createdAt: v.string(),
    thinkingEnabled: v.boolean(),
    selfReviewMode: v.string(),
    faaConfig: v.optional(v.any()),
    isbaoStage: v.optional(v.number()),
  }).index("by_projectId", ["projectId"]),

  documentRevisions: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    originalId: v.string(),
    documentName: v.string(),
    documentType: v.string(), // "regulatory" | "entity" | "uploaded"
    sourceDocumentId: v.string(),
    category: v.optional(v.string()),
    detectedRevision: v.string(),
    latestKnownRevision: v.string(),
    isCurrentRevision: v.optional(v.boolean()),
    lastCheckedAt: v.optional(v.string()),
    searchSummary: v.string(),
    status: v.string(), // RevisionStatus
  }).index("by_projectId", ["projectId"]),

  projectAgentDocuments: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    agentId: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    extractedAt: v.string(),
  }).index("by_projectId_agentId", ["projectId", "agentId"]),

  sharedAgentDocuments: defineTable({
    agentId: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    addedAt: v.string(),
    addedBy: v.string(), // Clerk userId
  }).index("by_agentId", ["agentId"]),

  userSettings: defineTable({
    userId: v.string(),
    thinkingEnabled: v.boolean(),
    thinkingBudget: v.number(),
    selfReviewMode: v.string(),
    selfReviewMaxIterations: v.number(),
    activeProjectId: v.optional(v.id("projects")),
    googleClientId: v.optional(v.string()),
    googleApiKey: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    claudeModel: v.optional(v.string()),
    auditSimModel: v.optional(v.string()),
    paperworkReviewModel: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  sharedReferenceDocuments: defineTable({
    documentType: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    addedAt: v.string(),
    addedBy: v.string(),
  }).index("by_documentType", ["documentType"]),

  documentReviews: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    underReviewDocumentId: v.id("documents"),
    name: v.optional(v.string()),
    status: v.string(),
    verdict: v.optional(v.string()),
    findings: v.optional(v.any()),
    reviewScope: v.optional(v.string()),
    notes: v.optional(v.string()),
    referenceDocumentIds: v.optional(v.array(v.id("documents"))),
    sharedReferenceDocumentIds: v.optional(v.array(v.id("sharedReferenceDocuments"))),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_underReview", ["projectId", "underReviewDocumentId"]),
});
