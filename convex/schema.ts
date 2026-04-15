import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const rosterPromptFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  fieldType: v.union(
    v.literal("date"),
    v.literal("text"),
    v.literal("textarea"),
    v.literal("number"),
    v.literal("select"),
  ),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.string())),
  placeholder: v.optional(v.string()),
});

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

  companies: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    isActive: v.boolean(),
    createdBy: v.string(), // Clerk userId
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_name", ["name"]),

  companyMemberships: defineTable({
    companyId: v.id("companies"),
    userId: v.string(), // Clerk userId
    role: v.string(), // "company_admin" | "company_manager" | "company_user"
    status: v.optional(v.string()), // "active" | "invited" | "suspended"
    addedBy: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_userId", ["userId"])
    .index("by_companyId_userId", ["companyId", "userId"]),

  companySupportAssignments: defineTable({
    companyId: v.id("companies"),
    supportUserId: v.string(), // Clerk userId (AeroGap employee/admin)
    assignedBy: v.string(), // Clerk userId
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_supportUserId", ["supportUserId"])
    .index("by_companyId_supportUserId", ["companyId", "supportUserId"]),

  companyFeaturePolicies: defineTable({
    companyId: v.id("companies"),
    enabledAgents: v.optional(v.array(v.string())),
    enabledFrameworks: v.optional(v.array(v.string())),
    enabledFeatures: v.optional(v.array(v.string())),
    logbookEnabled: v.optional(v.boolean()),
    logbookEntitlementMode: v.optional(v.union(v.literal("addon"), v.literal("standalone"))),
    forceCompanyContextDefault: v.optional(v.boolean()),
    /** HTTPS URL to POST CAR lifecycle events (create/update). Optional per-tenant integration. */
    carLifecycleWebhookUrl: v.optional(v.string()),
    /** Optional shared secret sent as X-AeroGap-Webhook-Secret on outbound webhooks. */
    carLifecycleWebhookSecret: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_companyId", ["companyId"]),

  productEvents: defineTable({
    /**
     * Analytics actor id.
     * - Signed-in users: ctx.auth.subject
     * - Unauthenticated visitors: anonymous id (client-provided)
     */
    actorId: v.string(),
    eventType: v.string(), // e.g. landing_cta_click, first_run_complete, finding_accepted
    projectId: v.optional(v.id("projects")),
    properties: v.optional(v.string()), // JSON string
    createdAt: v.string(),
  })
    .index("by_actorId_eventType", ["actorId", "eventType"]),

  projects: defineTable({
    userId: v.string(),
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"])
    .index("by_companyId", ["companyId"])
    .index("by_companyId_updatedAt", ["companyId", "updatedAt"]),

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
    /** Full extracted text when it does not fit in `extractedText` (Convex 1 MiB row limit). */
    extractedTextStorageId: v.optional(v.id("_storage")),
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
    region: v.optional(v.string()), // "us" | "easa" | "icao" | "all" — geographic applicability
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
    region: v.optional(v.string()), // "us" | "easa" | "icao" | "all" — geographic applicability
    /** Omit for platform-wide KB visible to all companies; set to scope to one tenant. */
    companyId: v.optional(v.id("companies")),
  })
    .index("by_agentId", ["agentId"])
    .index("by_companyId", ["companyId"]),

  userSettings: defineTable({
    userId: v.string(),
    thinkingEnabled: v.boolean(),
    thinkingBudget: v.number(),
    /** When true, uses adaptive thinking (Claude 4.6+) instead of manual budget. */
    adaptiveThinking: v.optional(v.boolean()),
    /** Effort level for adaptive thinking: 'low' | 'medium' | 'high' | 'max'. */
    adaptiveThinkingEffort: v.optional(v.string()),
    selfReviewMode: v.string(),
    selfReviewMaxIterations: v.number(),
    logbookEnabled: v.optional(v.boolean()),
    logbookEntitlementMode: v.optional(v.union(v.literal("addon"), v.literal("standalone"))),
    activeProjectId: v.optional(v.id("projects")),
    activeCompanyId: v.optional(v.id("companies")),
    googleClientId: v.optional(v.string()),
    googleApiKey: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    claudeModel: v.optional(v.string()),
    auditSimModel: v.optional(v.string()),
    paperworkReviewModel: v.optional(v.string()),
    paperworkReviewAgentId: v.optional(v.string()),
    dctTraceabilityModel: v.optional(v.string()),
    dctTraceabilityAgentId: v.optional(v.string()),
    forceCompanyContextDefault: v.optional(v.boolean()),
    /** Enabled auditor agent IDs — null/undefined = all enabled (default). */
    enabledAgents: v.optional(v.array(v.string())),
    /** Enabled checklist framework IDs — null/undefined = all enabled (default). */
    enabledFrameworks: v.optional(v.array(v.string())),
    /** Enabled feature keys (see src/config/featureKeys.ts) — null/undefined = all features enabled (default). */
    enabledFeatures: v.optional(v.array(v.string())),
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
    /** Optional precomputed hash for DCT XML content (used for version pinning/diff previews). */
    contentHash: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    addedAt: v.string(),
    addedBy: v.string(),
    /** Omit for platform-wide refs visible to all companies; set to scope to one tenant. */
    companyId: v.optional(v.id("companies")),
  })
    .index("by_documentType", ["documentType"])
    .index("by_companyId", ["companyId"]),

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
    /** Idempotent id from an external QMS / CMP / integration (for sync and webhooks). */
    externalId: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_assessment", ["projectId", "assessmentId"])
    .index("by_projectId_status", ["projectId", "status"]),

  entityProfiles: defineTable({
    /** Set for legacy/personal projects without a tenant company. */
    projectId: v.optional(v.id("projects")),
    /** Set when the profile is shared across all projects for this organization (NCAR, etc.). */
    companyId: v.optional(v.id("companies")),
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
    // ── Expanded aerospace capability fields ──
    /** Software/hardware design assurance levels (DO-178C / DO-254). */
    designAssuranceLevels: v.optional(v.object({
      softwareDal: v.optional(v.string()), // "A" | "B" | "C" | "D" | "E"
      hardwareDal: v.optional(v.string()),
    })),
    /** NADCAP-accredited special process types. */
    nadcapAccreditations: v.optional(v.array(v.string())), // ["ndt", "heat-treat", "welding", ...]
    /** CMMC cybersecurity maturity level. */
    cmmcLevel: v.optional(v.string()), // "1" | "2" | "3"
    /** Space programs the entity participates in. */
    spacePrograms: v.optional(v.array(v.string())),
    /** Whether entity holds defense contracts (FAR/DFARS). */
    isDefenseContractor: v.optional(v.boolean()),
    /** Additive manufacturing capabilities. */
    amCapabilities: v.optional(v.array(v.string())), // ["lpbf-ti", "lpbf-inconel", "wire-ded", ...]
    /** UAS / eVTOL certifications held. */
    uasCertifications: v.optional(v.array(v.string())),
    /** Laboratory accreditations. */
    labAccreditations: v.optional(v.array(v.string())), // ["iso17025", "nadcap-matl-test", ...]
    sourceAssessmentId: v.optional(v.id("assessments")),
    importedFromAssessmentAt: v.optional(v.string()),
    lastSyncedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_companyId", ["companyId"]),

  entityClassRatings: defineTable({
    /** Link back to owning profile row. */
    entityProfileId: v.id("entityProfiles"),
    /** Optional project scope (legacy/personal). */
    projectId: v.optional(v.id("projects")),
    /** Optional org scope (tenant-wide shared profile). */
    companyId: v.optional(v.id("companies")),
    /** FAA class rating family. */
    category: v.string(),
    /** Class number within category (typically 1-4). */
    classNumber: v.number(),
    limitations: v.optional(v.string()),
    /** User-controlled inclusion toggle for DCT mapping. */
    isActive: v.optional(v.boolean()),
    /** Pre-normalized matching tokens for deterministic applicability. */
    normalizedTokens: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_entityProfileId", ["entityProfileId"])
    .index("by_projectId", ["projectId"])
    .index("by_companyId", ["companyId"]),

  entityCapabilityList: defineTable({
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    clNumber: v.optional(v.string()),
    articleDescription: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.array(v.string()),
    technicalDataRef: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** User-controlled inclusion toggle for DCT mapping. */
    isActive: v.optional(v.boolean()),
    /** Pre-normalized matching tokens for deterministic applicability. */
    normalizedTokens: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_entityProfileId", ["entityProfileId"])
    .index("by_projectId", ["projectId"])
    .index("by_companyId", ["companyId"]),

  rosterRequirementTypes: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    name: v.string(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultRecurrenceDays: v.optional(v.number()),
    defaultGraceDays: v.optional(v.number()),
    /** How the next due date is computed (hybrid presets + admin overrides). */
    dueDateStrategy: v.optional(
      v.union(
        v.literal("fixed_days"),
        v.literal("fixed_interval"),
        v.literal("calendar_month_end"),
        v.literal("ia_march_odd_year"),
      ),
    ),
    defaultIntervalValue: v.optional(v.number()),
    defaultIntervalUnit: v.optional(
      v.union(v.literal("days"), v.literal("months"), v.literal("years")),
    ),
    /** For calendar_month_end when not using defaultInterval* */
    defaultCalendarMonths: v.optional(v.number()),
    /** Assignment-time prompts (evidence); answers stored on rosterAssignments.evidence */
    promptSchema: v.optional(v.array(rosterPromptFieldValidator)),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  rosterPersonnel: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    fullName: v.string(),
    roleTitle: v.optional(v.string()),
    jobDescription: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    certificateNumber: v.optional(v.string()),
    capabilities: v.array(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  rosterAssignments: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    personId: v.id("rosterPersonnel"),
    requirementTypeId: v.id("rosterRequirementTypes"),
    assignedDate: v.optional(v.string()),
    lastCompletedDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    recurrenceDaysOverride: v.optional(v.number()),
    recurrenceIntervalValueOverride: v.optional(v.number()),
    recurrenceIntervalUnitOverride: v.optional(
      v.union(v.literal("days"), v.literal("months"), v.literal("years")),
    ),
    graceDaysOverride: v.optional(v.number()),
    notes: v.optional(v.string()),
    evidenceLink: v.optional(v.string()),
    /** Keyed by prompt field id from requirement.promptSchema */
    evidence: v.optional(v.record(v.string(), v.string())),
    /** True when due date may need human review (e.g. missing baseline evidence). */
    needsRuleMigrationReview: v.optional(v.boolean()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_personId", ["personId"])
    .index("by_requirementTypeId", ["requirementTypeId"]),

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
    /** Saved checklist series (recurring ops / audit prep history). */
    checklistSeriesId: v.optional(v.id("checklistSeries")),
    checklistOccurrenceId: v.optional(v.id("checklistOccurrences")),
    checklistPurpose: v.optional(
      v.union(
        v.literal("pre_audit"),
        v.literal("recurring_ops"),
        v.literal("event"),
      ),
    ),
    /** Next cycle due (YYYY-MM-DD); primary anchor for recurring series runs. */
    nextCycleDue: v.optional(v.string()),
    runIntervalMonths: v.optional(v.number()),
    runIntervalDays: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_framework", ["projectId", "framework"])
    .index("by_checklistSeriesId", ["checklistSeriesId"]),

  /** Named checklist track — groups occurrences (cycles) for export and audit prep. */
  checklistSeries: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    name: v.string(),
    purpose: v.union(
      v.literal("pre_audit"),
      v.literal("recurring_ops"),
      v.literal("event"),
    ),
    isRecurring: v.boolean(),
    intervalMonths: v.optional(v.number()),
    intervalDays: v.optional(v.number()),
    framework: v.string(),
    frameworkLabel: v.string(),
    subtypeId: v.optional(v.string()),
    subtypeLabel: v.optional(v.string()),
    generatedFromTemplateVersion: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  /** One execution cycle of a series — links to auditChecklistRuns for item state at that time. */
  checklistOccurrences: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    seriesId: v.id("checklistSeries"),
    checklistRunId: v.id("auditChecklistRuns"),
    occurrenceIndex: v.number(),
    label: v.optional(v.string()),
    plannedDueDate: v.optional(v.string()),
    closedAt: v.optional(v.string()),
    onTime: v.optional(v.boolean()),
    lateReason: v.optional(v.string()),
    completionTotal: v.optional(v.number()),
    completionComplete: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_seriesId", ["seriesId"])
    .index("by_checklistRunId", ["checklistRunId"]),

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
    /** Calendar recurrence: after completion, next due is computed from lastPerformedAt + interval. */
    intervalMonths: v.optional(v.number()),
    intervalDays: v.optional(v.number()),
    /** ISO date YYYY-MM-DD of last completion (for recurring items). */
    lastPerformedAt: v.optional(v.string()),
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
    signoffName: v.optional(v.string()),
    signoffCertNumber: v.optional(v.string()),
    signoffCertType: v.optional(v.string()),
    signoffDate: v.optional(v.string()),
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
    // Per-section style overrides (null = inherit from manual-level setting)
    toneOverride: v.optional(v.string()),
    citationsOverride: v.optional(v.union(v.boolean(), v.null())),
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
    // Capabilities enabled for this manual/project (stored on some legacy rows).
    enabledCapabilities: v.optional(v.array(v.string())),
    // Writing style and format configuration
    writingStyle: v.optional(v.string()), // "formal" | "professional" | "semi-formal" | "accessible" | "light"
    citationsEnabled: v.optional(v.boolean()),
    formatConfig: v.optional(v.object({
      font: v.string(),    // "Calibri" | "Times New Roman" | "Arial" | "Georgia"
      margins: v.string(), // "standard" | "condensed" | "expanded"
    })),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_projectId", ["projectId"])
    .index("by_customerUserId", ["customerUserId"]),

  manualRevisions: defineTable({
    manualId: v.id("manuals"),
    revisionNumber: v.string(),
    revisionTitle: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("documents")),
    status: v.string(), // "draft" | "submitted" | "customer_reviewing" | "customer_approved" | "customer_rejected" | "superseded"
    notes: v.optional(v.string()),
    submittedBy: v.optional(v.string()),
    submittedAt: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_manualId", ["manualId"])
    .index("by_sourceDocumentId", ["sourceDocumentId"]),

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

  manualRevisionLinks: defineTable({
    projectId: v.id("projects"),
    manualId: v.id("manuals"),
    manualRevisionId: v.id("manualRevisions"),
    sourceDocumentId: v.optional(v.id("documents")),
    documentRevisionId: v.optional(v.id("documentRevisions")),
    documentName: v.optional(v.string()),
    detectedRevision: v.optional(v.string()),
    manualRevisionNumber: v.string(),
    comparisonStatus: v.union(v.literal("match"), v.literal("mismatch"), v.literal("unknown")),
    matchConfidence: v.optional(v.number()),
    lastSyncedAt: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_manualRevisionId", ["manualRevisionId"])
    .index("by_manualId", ["manualId"])
    .index("by_sourceDocumentId", ["sourceDocumentId"]),

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
    // Structured compliance sub-fields
    adComplianceDetails: v.optional(v.any()), // AdComplianceDetail[]
    sbComplianceDetails: v.optional(v.any()), // SbComplianceDetail[]
    componentMentions: v.optional(v.any()), // ComponentMention[]
    regulatoryBasis: v.optional(v.string()), // CFR section e.g. "91.413"
    inspectionType: v.optional(v.string()), // InspectionSubType
    nextDueDate: v.optional(v.string()), // ISO date
    recurrenceInterval: v.optional(v.number()),
    recurrenceUnit: v.optional(v.string()), // "hours" | "cycles" | "landings" | "calendar_months" | "calendar_days"
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
    entryType: v.optional(v.string()), // "maintenance" | "preventive_maintenance" | "alteration" | "rebuilding" | "inspection" | "regulatory_check" | "ad_compliance" | "sb_compliance" | "operational" | "life_limited_component" | "other"
    confidence: v.optional(v.number()), // 0-1 overall parse confidence
    fieldConfidence: v.optional(v.any()), // per-field confidence map
    // Structured compliance sub-fields
    adComplianceDetails: v.optional(v.any()), // AdComplianceDetail[] — full AD lifecycle data
    sbComplianceDetails: v.optional(v.any()), // SbComplianceDetail[] — full SB lifecycle data
    componentMentions: v.optional(v.any()), // ComponentMention[] — part install/remove/inspect details
    regulatoryBasis: v.optional(v.string()), // CFR section e.g. "91.413", "91.411"
    inspectionType: v.optional(v.string()), // InspectionSubType: "annual" | "100_hour" | "progressive" | etc.
    nextDueDate: v.optional(v.string()), // ISO date for next-due compliance
    recurrenceInterval: v.optional(v.number()), // e.g. 24 (months), 500 (hours)
    recurrenceUnit: v.optional(v.string()), // "hours" | "cycles" | "landings" | "calendar_months" | "calendar_days"
    userVerified: v.optional(v.boolean()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_aircraftId", ["aircraftId"])
    .index("by_aircraftId_entryDate", ["aircraftId", "entryDate"])
    .index("by_sourceDocumentId", ["sourceDocumentId"])
    .index("by_aircraftId_entryType", ["aircraftId", "entryType"]),

  form337Records: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.optional(v.id("aircraftAssets")),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("ready_for_review")),
    formData: v.any(),
    fieldMappedOutput: v.optional(v.any()),
    narrativeDraftOutput: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_status", ["projectId", "status"]),

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

  /** Per-project DCT module schedule, applicability toggles, and cached status. */
  dctProjectSettings: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    scheduleIntervalDays: v.number(),
    lastCheckCompletedAt: v.optional(v.string()),
    nextDueAt: v.optional(v.string()),
    lastXmlIngestAt: v.optional(v.string()),
    lastDrssyncAt: v.optional(v.string()),
    showAllDcts: v.optional(v.boolean()),
    /** Substrings matched against peer group / document title (include). */
    includedPeerGroupSubstrings: v.optional(v.array(v.string())),
    /** Substrings excluded after include pass. */
    excludedPeerGroupSubstrings: v.optional(v.array(v.string())),
    /**
     * Structured applicability controls:
     * - "heuristics_only": ignore structured ratings/capabilities
     * - "structured_preferred": structured first, heuristic fallback
     */
    applicabilityMode: v.optional(v.union(v.literal("heuristics_only"), v.literal("structured_preferred"))),
    /** Explicit include list for ratings/capabilities that should drive DCT applicability. */
    selectedClassRatingIds: v.optional(v.array(v.id("entityClassRatings"))),
    selectedCapabilityIds: v.optional(v.array(v.id("entityCapabilityList"))),
    /** Last computed: green | yellow | red | unknown */
    lastStatus: v.optional(v.string()),
    /** Running total of dctQuestions rows for this project (updated by ingest mutations). */
    cachedQuestionCount: v.optional(v.number()),
    /** Running total of dctComparisons rows (equals cachedQuestionCount; 1:1 with questions). */
    cachedComparisonTotal: v.optional(v.number()),
    /** DCT library tracking mode: latest follows library updates; pinned requires explicit update. */
    dctLibraryTrackingMode: v.optional(
      v.union(v.literal("latest"), v.literal("pinned")),
    ),
    /** Current pinned/reference version snapshot entries: "<path>::<hashOrVersionToken>". */
    pinnedDctReferenceSignatures: v.optional(v.array(v.string())),
    /** Human-readable label for pinned snapshot (e.g. latest timestamp). */
    pinnedDctLibraryLabel: v.optional(v.string()),
    /** Last applied/synced DCT library signature set. */
    lastDctLibrarySyncSignatures: v.optional(v.array(v.string())),
    /** Timestamp of last recorded DCT library sync/pin action. */
    lastDctLibrarySyncAt: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  /** One row per ingested DCT XML (or DRS-only stub). */
  dctToolDocuments: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    source: v.union(v.literal("xml"), v.literal("drs")),
    fileName: v.optional(v.string()),
    contentHash: v.optional(v.string()),
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
    /** DRS listing identifier when source is drs */
    drsDocumentNumber: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_hash", ["projectId", "contentHash"]),

  /** Company-level parsed DCT cache keyed by content hash (one-time upload parse). */
  dctParsedLibraryDocuments: defineTable({
    companyId: v.id("companies"),
    contentHash: v.string(),
    fileName: v.optional(v.string()),
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
    questionCount: v.number(),
    sourceSharedReferenceDocumentId: v.optional(v.id("sharedReferenceDocuments")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_hash", ["companyId", "contentHash"]),

  /** Normalized question rows for company-level parsed DCT cache. */
  dctParsedLibraryQuestions: defineTable({
    companyId: v.id("companies"),
    contentHash: v.string(),
    displayOrder: v.optional(v.number()),
    questionId: v.string(),
    questionDetailsId: v.optional(v.string()),
    qVersionNumber: v.optional(v.string()),
    qVersionDate: v.optional(v.string()),
    text: v.string(),
    safetyAttribute: v.optional(v.string()),
    questionType: v.optional(v.string()),
    scopingAttribute: v.optional(v.string()),
    noteToUser: v.optional(v.string()),
    references: v.optional(
      v.array(
        v.object({
          srcId: v.optional(v.string()),
          label: v.string(),
        }),
      ),
    ),
    responses: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_companyId_hash", ["companyId", "contentHash"])
    .index("by_companyId_hash_questionId", ["companyId", "contentHash", "questionId"]),

  /** Normalized DCT question (requirement) for traceability. */
  dctQuestions: defineTable({
    projectId: v.id("projects"),
    dctDocumentId: v.id("dctToolDocuments"),
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
    references: v.optional(
      v.array(
        v.object({
          srcId: v.optional(v.string()),
          label: v.string(),
        }),
      ),
    ),
    responses: v.optional(v.array(v.string())),
    createdAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_dctDocumentId", ["dctDocumentId"])
    .index("by_projectId_questionId", ["projectId", "questionId"]),

  /** Manual / document traceability per question. */
  dctComparisons: defineTable({
    projectId: v.id("projects"),
    questionId: v.id("dctQuestions"),
    underReviewDocumentId: v.optional(v.id("documents")),
    status: v.union(
      v.literal("pending"),
      v.literal("aligned"),
      v.literal("gap"),
      v.literal("mismatch"),
    ),
    evidenceSnippet: v.optional(v.string()),
    rationale: v.optional(v.string()),
    applicabilityState: v.optional(
      v.union(
        v.literal("applicable"),
        v.literal("unsure"),
        v.literal("not_applicable"),
      ),
    ),
    applicabilityConfidence: v.optional(v.number()),
    applicabilitySource: v.optional(v.string()),
    resolved: v.optional(v.boolean()),
    updatedAt: v.string(),
    userId: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_questionId", ["questionId"]),

  dctRevisionChecks: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    kind: v.union(
      v.literal("xml_ingest"),
      v.literal("drs_sync"),
      v.literal("scheduled_tick"),
      v.literal("compare_run"),
      v.literal("library_version_update"),
    ),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    summary: v.optional(v.string()),
    newOrUpdatedCount: v.optional(v.number()),
  }).index("by_projectId", ["projectId"]),

  dctReports: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    createdAt: v.string(),
    title: v.string(),
    verdict: v.union(
      v.literal("pass"),
      v.literal("conditional"),
      v.literal("fail"),
      v.literal("pending"),
    ),
    stats: v.optional(v.any()),
    markdownBody: v.optional(v.string()),
  }).index("by_projectId", ["projectId"]),

  /** FAA DRS browse listing rows (per project snapshot). */
  dctDrssCatalogEntries: defineTable({
    projectId: v.id("projects"),
    documentNumber: v.string(),
    title: v.string(),
    dctRevision: v.optional(v.string()),
    revisionDate: v.optional(v.string()),
    peerGroupLabel: v.optional(v.string()),
    inspectorSpecialty: v.optional(v.string()),
    status: v.optional(v.string()),
    drsUrl: v.optional(v.string()),
    fetchedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_documentNumber", ["projectId", "documentNumber"]),
});
