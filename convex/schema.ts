import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
    role: v.string(), // "user" | "admin" | "aerogap_employee"
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
    extractionMeta: v.optional(v.object({
      backend: v.string(),
      confidence: v.optional(v.number()),
    })),
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
    isPaused: v.optional(v.boolean()),
    currentRound: v.optional(v.number()),
    discrepancies: v.optional(v.any()),
    dataSummary: v.optional(v.any()),
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
    logbookEnabled: v.optional(v.boolean()),
    logbookEntitlementMode: v.optional(v.union(v.literal("addon"), v.literal("standalone"))),
    activeProjectId: v.optional(v.id("projects")),
    googleClientId: v.optional(v.string()),
    googleApiKey: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    claudeModel: v.optional(v.string()),
    auditSimModel: v.optional(v.string()),
    paperworkReviewModel: v.optional(v.string()),
    paperworkReviewAgentId: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  sharedReferenceDocuments: defineTable({
    documentType: v.string(),
    canonicalDocType: v.optional(v.string()),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    sourceUrl: v.optional(v.string()),
    issuer: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
    revision: v.optional(v.string()),
    notes: v.optional(v.string()),
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
    auditorIds: v.optional(v.array(v.string())),
    name: v.optional(v.string()),
    status: v.string(),
    verdict: v.optional(v.string()),
    findings: v.optional(v.any()),
    reviewScope: v.optional(v.string()),
    notes: v.optional(v.string()),
    referenceDocumentId: v.optional(v.id("documents")),
    referenceDocumentIds: v.optional(v.array(v.id("documents"))),
    sharedReferenceDocumentIds: v.optional(v.array(v.id("sharedReferenceDocuments"))),
    batchId: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_underReview", ["projectId", "underReviewDocumentId"]),

  entityIssues: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    assessmentId: v.optional(v.string()),
    source: v.union(v.literal("audit_sim"), v.literal("paperwork_review"), v.literal("analysis"), v.literal("manual"), v.literal("logbook_compliance")),
    sourceId: v.optional(v.string()),
    severity: v.union(v.literal("critical"), v.literal("major"), v.literal("minor"), v.literal("observation")),
    title: v.string(),
    description: v.string(),
    regulationRef: v.optional(v.string()),
    location: v.optional(v.string()),
    createdAt: v.string(),
    // CAR / NCR Lifecycle fields
    status: v.optional(v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("pending_verification"),
      v.literal("closed"),
      v.literal("voided")
    )),
    carNumber: v.optional(v.string()),
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    rootCauseCategory: v.optional(v.union(
      v.literal("training"),
      v.literal("procedure"),
      v.literal("equipment"),
      v.literal("human_error"),
      v.literal("process"),
      v.literal("material"),
      v.literal("management")
    )),
    rootCause: v.optional(v.string()),
    correctiveAction: v.optional(v.string()),
    preventiveAction: v.optional(v.string()),
    evidenceOfClosure: v.optional(v.string()),
    closedAt: v.optional(v.string()),
    verifiedBy: v.optional(v.string()),
    aiRootCauseAnalysis: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_assessment", ["projectId", "assessmentId"])
    .index("by_projectId_status", ["projectId", "status"]),

  entityProfiles: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    companyName: v.optional(v.string()),
    legalEntityName: v.optional(v.string()),
    primaryLocation: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    repairStationType: v.optional(v.string()),
    facilitySquareFootage: v.optional(v.number()),
    employeeCount: v.optional(v.number()),
    operationsScope: v.optional(v.string()),
    certifications: v.optional(v.array(v.string())),
    aircraftCategories: v.optional(v.array(v.string())),
    servicesOffered: v.optional(v.array(v.string())),
    hasSms: v.optional(v.boolean()),
    smsMaturity: v.optional(v.string()),
    sourceAssessmentId: v.optional(v.id("assessments")),
    importedFromAssessmentAt: v.optional(v.string()),
    lastSyncedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"]),

  auditChecklistRuns: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    profileId: v.optional(v.id("entityProfiles")),
    name: v.optional(v.string()),
    framework: v.string(),
    frameworkLabel: v.string(),
    subtypeId: v.optional(v.string()),
    subtypeLabel: v.optional(v.string()),
    status: v.string(), // "draft" | "active" | "completed" | "archived"
    generatedFromTemplateVersion: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_framework", ["projectId", "framework"]),

  auditChecklistItems: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    checklistRunId: v.id("auditChecklistRuns"),
    framework: v.string(),
    subtypeId: v.optional(v.string()),
    section: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    requirementRef: v.optional(v.string()),
    evidenceHint: v.optional(v.string()),
    severity: v.union(
      v.literal("critical"),
      v.literal("major"),
      v.literal("minor"),
      v.literal("observation")
    ),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("complete"),
      v.literal("blocked")
    ),
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    sourceType: v.optional(v.union(
      v.literal("template"),
      v.literal("document"),
      v.literal("custom"),
      v.literal("manual")
    )),
    sourceDocumentId: v.optional(v.union(
      v.id("documents"),
      v.id("sharedReferenceDocuments")
    )),
    sourceDocumentName: v.optional(v.string()),
    linkedIssueId: v.optional(v.id("entityIssues")),
    createdAt: v.string(),
    updatedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_checklistRunId", ["checklistRunId"])
    .index("by_projectId_framework", ["projectId", "framework"]),

  checklistCustomTemplates: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    framework: v.string(),
    subtypeId: v.optional(v.string()),
    subtypeLabel: v.optional(v.string()),
    items: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      severity: v.union(
        v.literal("critical"),
        v.literal("major"),
        v.literal("minor"),
        v.literal("observation")
      ),
      requirementRef: v.optional(v.string()),
      evidenceHint: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_project_framework_subtype", ["projectId", "framework", "subtypeId"])
    .index("by_projectId", ["projectId"]),

  manualSections: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    manualType: v.string(),
    manualId: v.optional(v.id("manuals")),
    sectionTitle: v.string(),
    sectionNumber: v.optional(v.string()),
    generatedContent: v.string(),
    cfrRefs: v.optional(v.array(v.string())),
    activeStandards: v.optional(v.array(v.string())),
    sourceDocumentId: v.optional(v.id("documents")),
    status: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_manualType", ["projectId", "manualType"])
    .index("by_manualType_status", ["manualType", "status"]),

  manuals: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    customerUserId: v.optional(v.string()),
    manualType: v.string(),
    title: v.string(),
    currentRevision: v.string(),
    status: v.string(), // "draft" | "in_review" | "approved" | "published"
    definitions: v.optional(v.array(v.object({ term: v.string(), definition: v.string() }))),
    appendixNotes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_projectId", ["projectId"])
    .index("by_customerUserId", ["customerUserId"]),

  manualRevisions: defineTable({
    manualId: v.id("manuals"),
    revisionNumber: v.string(),
    status: v.string(), // "draft" | "submitted" | "customer_reviewing" | "customer_approved" | "customer_rejected" | "superseded"
    notes: v.optional(v.string()),
    submittedBy: v.optional(v.string()),
    submittedAt: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_manualId", ["manualId"]),

  manualChangeLogs: defineTable({
    manualId: v.id("manuals"),
    revisionId: v.id("manualRevisions"),
    section: v.string(),
    description: v.string(),
    changeType: v.string(), // "added" | "modified" | "deleted" | "admin_change"
    authorId: v.string(),
    createdAt: v.string(),
  })
    .index("by_revisionId", ["revisionId"])
    .index("by_manualId", ["manualId"]),

  inspectionScheduleItems: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    // Allow legacy rows where IDs were persisted as plain strings.
    sourceDocumentId: v.optional(v.union(v.id("documents"), v.string())),
    sourceDocumentName: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
    intervalType: v.string(),
    intervalMonths: v.optional(v.union(v.number(), v.null())),
    intervalDays: v.optional(v.union(v.number(), v.null())),
    intervalValue: v.optional(v.union(v.number(), v.null())),
    regulationRef: v.optional(v.union(v.string(), v.null())),
    isRegulatory: v.optional(v.union(v.boolean(), v.null())),
    lastPerformedAt: v.optional(v.union(v.string(), v.null())),
    lastPerformedSource: v.optional(v.union(v.string(), v.null())),
    documentExcerpt: v.optional(v.union(v.string(), v.null())),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  // ── Aircraft Logbook Management ─────────────────────────────────────────

  aircraftAssets: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    tailNumber: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    serial: v.optional(v.string()),
    operator: v.optional(v.string()),
    year: v.optional(v.number()),
    baselineTotalTime: v.optional(v.number()),
    baselineTotalCycles: v.optional(v.number()),
    baselineTotalLandings: v.optional(v.number()),
    baselineAsOfDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()), // "active" | "inactive" | "archived"
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_tailNumber", ["tailNumber"]),

  logbookDraftEntries: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    sourceDocumentId: v.id("documents"),
    sourcePage: v.optional(v.number()),
    rawText: v.string(),
    entryDate: v.optional(v.string()),
    workPerformed: v.optional(v.string()),
    ataChapter: v.optional(v.string()),
    adReferences: v.optional(v.array(v.string())),
    sbReferences: v.optional(v.array(v.string())),
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
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_aircraftId", ["aircraftId"])
    .index("by_sourceDocumentId", ["sourceDocumentId"])
    .index("by_aircraftId_sourceDocumentId", ["aircraftId", "sourceDocumentId"]),

  logbookEntries: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    sourceDocumentId: v.optional(v.id("documents")),
    sourcePage: v.optional(v.number()),
    rawText: v.string(),
    entryDate: v.optional(v.string()),
    workPerformed: v.optional(v.string()),
    ataChapter: v.optional(v.string()),
    adReferences: v.optional(v.array(v.string())),
    sbReferences: v.optional(v.array(v.string())),
    adSbReferences: v.optional(v.array(v.string())),
    totalTimeAtEntry: v.optional(v.number()),
    totalCyclesAtEntry: v.optional(v.number()),
    totalLandingsAtEntry: v.optional(v.number()),
    signerName: v.optional(v.string()),
    signerCertNumber: v.optional(v.string()),
    signerCertType: v.optional(v.string()), // "A&P" | "IA" | "Repairman" | "Repair Station" | etc.
    returnToServiceStatement: v.optional(v.string()),
    hasReturnToService: v.optional(v.boolean()),
    entryType: v.optional(v.string()), // "maintenance" | "preventive_maintenance" | "alteration" | "rebuilding" | "inspection" | "ad_compliance" | "other"
    confidence: v.optional(v.number()), // 0-1 overall parse confidence
    fieldConfidence: v.optional(v.any()), // per-field confidence map
    userVerified: v.optional(v.boolean()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_aircraftId", ["aircraftId"])
    .index("by_aircraftId_entryDate", ["aircraftId", "entryDate"])
    .index("by_sourceDocumentId", ["sourceDocumentId"]),

  aircraftComponents: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    partNumber: v.string(),
    serialNumber: v.optional(v.string()),
    description: v.string(),
    ataChapter: v.optional(v.string()),
    position: v.optional(v.string()),
    isLifeLimited: v.optional(v.boolean()),
    lifeLimit: v.optional(v.number()),
    lifeLimitUnit: v.optional(v.string()), // "hours" | "cycles" | "landings" | "calendar_months"
    tsnAtInstall: v.optional(v.number()),
    tsoAtInstall: v.optional(v.number()),
    cyclesAtInstall: v.optional(v.number()),
    aircraftTimeAtInstall: v.optional(v.number()),
    aircraftCyclesAtInstall: v.optional(v.number()),
    installDate: v.optional(v.string()),
    removeDate: v.optional(v.string()),
    installLogbookEntryId: v.optional(v.id("logbookEntries")),
    removeLogbookEntryId: v.optional(v.id("logbookEntries")),
    status: v.string(), // "installed" | "removed" | "scrapped"
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_aircraftId", ["aircraftId"])
    .index("by_aircraftId_status", ["aircraftId", "status"])
    .index("by_serialNumber", ["serialNumber"]),

  complianceRules: defineTable({
    ruleId: v.string(),
    cfrPart: v.string(),
    cfrSection: v.string(),
    title: v.string(),
    description: v.string(),
    requiredFields: v.array(v.string()),
    checkType: v.string(), // "required_field" | "signoff_completeness" | "interval_compliance" | "record_content"
    severity: v.string(), // "critical" | "major" | "minor"
    citation: v.string(),
    effectiveDate: v.optional(v.string()),
    supersededDate: v.optional(v.string()),
    regulatoryPack: v.string(), // "part43" | "part91" | "part145" | "part121" | "part135"
    version: v.number(),
    createdAt: v.string(),
  })
    .index("by_ruleId", ["ruleId"])
    .index("by_regulatoryPack", ["regulatoryPack"])
    .index("by_cfrSection", ["cfrSection"]),

  complianceFindings: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    logbookEntryId: v.optional(v.id("logbookEntries")),
    ruleId: v.string(),
    findingType: v.string(), // "missing_field" | "incomplete_signoff" | "missed_inspection" | "gap_detected" | "data_mismatch"
    severity: v.string(), // "critical" | "major" | "minor"
    title: v.string(),
    description: v.string(),
    citation: v.string(),
    evidenceSnippet: v.optional(v.string()),
    status: v.string(), // "open" | "acknowledged" | "resolved" | "false_positive"
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
    convertedToIssueId: v.optional(v.id("entityIssues")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_aircraftId", ["aircraftId"])
    .index("by_aircraftId_status", ["aircraftId", "status"])
    .index("by_logbookEntryId", ["logbookEntryId"]),
});
