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

const certificateAuthorityValidator = v.union(
  v.literal("faa"),
  v.literal("easa"),
  v.literal("isbao"),
  v.literal("as9100"),
  v.literal("icao"),
  v.literal("other"),
);

const certificateTypeValidator = v.union(
  v.literal("part145"),
  v.literal("part135"),
  v.literal("part121"),
  v.literal("part125"),
  v.literal("part129"),
  v.literal("part133"),
  v.literal("part137"),
  v.literal("part141"),
  v.literal("part142"),
  v.literal("part147"),
  v.literal("part91k"),
  v.literal("part91loa"),
  v.literal("easa145"),
  v.literal("isbao"),
  v.literal("as9100"),
  v.literal("custom"),
);

const certificateProfileStatusValidator = v.union(
  v.literal("active"),
  v.literal("provisional"),
  v.literal("suspended"),
  v.literal("expired"),
  v.literal("archived"),
);

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
    role: v.string(), // "user" | "admin" | "aerogap_employee"
    approvalStatus: v.optional(v.string()), // "pending" | "approved" | "rejected"; undefined = grandfathered/approved
    approvedAt: v.optional(v.string()),
    createdAt: v.string(),
    lastSignInAt: v.string(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_approvalStatus", ["approvalStatus"]),

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
    /** When "manual", admin toggles win over Stripe-synced entitlements. */
    entitlementSource: v.optional(v.union(v.literal("billing"), v.literal("manual"))),
    billingPlanId: v.optional(v.string()),
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
    folderId: v.optional(v.id("libraryFolders")),
    category: v.string(), // "uploaded" | "regulatory" | "entity" | "logbook" | "maintenance_manual" | "parts_catalog" | "logbook_scan" | "wiring_diagram"
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
    /** SHA-256 hex of original file bytes for deduplication within a project. */
    contentHash: v.optional(v.string()),
    extractedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_category", ["projectId", "category"])
    .index("by_projectId_folder", ["projectId", "folderId"])
    .index("by_projectId_contentHash", ["projectId", "contentHash"]),

  documentChunks: defineTable({
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    companyId: v.optional(v.id("companies")),
    category: v.string(),
    docName: v.string(),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    text: v.string(),
    startChar: v.number(),
    endChar: v.number(),
    embedding: v.array(v.float64()),
    embeddingProvider: v.optional(v.string()),
    embeddingModel: v.string(),
    createdAt: v.string(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_projectId", ["projectId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 512,
      filterFields: ["projectId", "companyId", "category", "documentId"],
    }),

  documentIndexStatus: defineTable({
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    lastAttemptedAt: v.string(),
    succeeded: v.boolean(),
    lastError: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    attempts: v.number(),
    lastChunkCount: v.optional(v.number()),
    contentHash: v.optional(v.string()),
  })
    .index("by_documentId", ["documentId"])
    .index("by_projectId", ["projectId"]),

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
    dctDocumentCheckModel: v.optional(v.string()),
    dctDocumentCheckAgentId: v.optional(v.string()),
    forceCompanyContextDefault: v.optional(v.boolean()),
    // Avianis integration — per-user credentials + cached token + sync metadata.
    avianisAuthMethod: v.optional(v.string()), // "api_key" | "oauth2" | "password"
    avianisBaseUrl: v.optional(v.string()),
    avianisTenantId: v.optional(v.string()),
    avianisApiKey: v.optional(v.string()),
    avianisClientId: v.optional(v.string()),
    avianisClientSecret: v.optional(v.string()),
    avianisUsername: v.optional(v.string()),
    avianisPassword: v.optional(v.string()),
    avianisCachedToken: v.optional(v.string()),
    avianisCachedTokenExpiresAt: v.optional(v.number()),
    avianisLastSyncedAt: v.optional(v.number()),
    avianisLastSyncError: v.optional(v.string()),
    /** Enabled auditor agent IDs — null/undefined = all enabled (default). */
    enabledAgents: v.optional(v.array(v.string())),
    /** Enabled checklist framework IDs — null/undefined = all enabled (default). */
    enabledFrameworks: v.optional(v.array(v.string())),
    /** Enabled feature keys (see src/config/featureKeys.ts) — null/undefined = all features enabled (default). */
    enabledFeatures: v.optional(v.array(v.string())),
    entitlementSource: v.optional(v.union(v.literal("billing"), v.literal("manual"))),
    billingPlanId: v.optional(v.string()),
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
    .index("by_companyId", ["companyId"])
    .index("by_companyId_documentType", ["companyId", "documentType"]),

  /** Background job: chunked bulk-delete of DCT XML shared refs + parsed library cache (avoids Convex read limits). */
  dctBulkDeleteJobs: defineTable({
    projectId: v.id("projects"),
    companyId: v.id("companies"),
    requestedBy: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    /** Optional UI hint (e.g. count from client before start). */
    totalEstimate: v.optional(v.number()),
    deletedDocs: v.number(),
    deletedParsedDocs: v.number(),
    deletedParsedQuestions: v.number(),
    /** Content hashes still needing parsed-cache cleanup (deduped). */
    pendingContentHashes: v.array(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_companyId_createdAt", ["companyId", "createdAt"])
    .index("by_projectId", ["projectId"]),

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

  dctDocumentChecks: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    verdict: v.optional(
      v.union(v.literal("pass"), v.literal("conditional"), v.literal("fail"), v.literal("pending")),
    ),
    scope: v.optional(v.string()),
    notes: v.optional(v.string()),
    perspectiveAgentId: v.optional(v.string()),
    model: v.optional(v.string()),
    totals: v.optional(
      v.object({
        questions: v.number(),
        critical: v.number(),
        major: v.number(),
        minor: v.number(),
        observation: v.number(),
        aligned: v.number(),
        gap: v.number(),
        mismatch: v.number(),
        pending: v.number(),
      }),
    ),
    findings: v.optional(v.any()),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  }).index("by_projectId", ["projectId"]),

  entityIssues: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    assessmentId: v.optional(v.string()),
    certificateProfileId: v.optional(v.id("certificateProfiles")),
    obligationRuleId: v.optional(v.string()),
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
    .index("by_projectId_status", ["projectId", "status"])
    .index("by_projectId_certificateProfileId", ["projectId", "certificateProfileId"]),

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
    // ── FAA certificate / OpSpec-related profile fields ──
    faaCertificateNumber: v.optional(v.string()),
    faaChdo: v.optional(v.string()),
    faaCertificateDate: v.optional(v.string()),
    faaLastAmendmentDate: v.optional(v.string()),
    faaPeerGroup: v.optional(v.union(v.literal("F"), v.literal("G"), v.literal("H"))),
    faaPart121Certificate: v.optional(v.string()),
    faaPart135Certificate: v.optional(v.string()),
    /** Additional FAA certificate-number fields, one per certificate part. */
    faaPart125Certificate: v.optional(v.string()),
    faaPart129Certificate: v.optional(v.string()),
    faaPart133Certificate: v.optional(v.string()),
    faaPart137Certificate: v.optional(v.string()),
    faaPart141Certificate: v.optional(v.string()),
    faaPart142Certificate: v.optional(v.string()),
    faaPart147Certificate: v.optional(v.string()),
    faaPart91KCertificate: v.optional(v.string()),
    /**
     * FAA certificate types the entity holds. Drives which OpSpec / MSpec /
     * TSpec / LOA per-paragraph checklist sections appear in the UI. Values
     * correspond to `FaaCertPart` in src/config/regulatoryTaxonomy/faaOpSpecs.ts.
     */
    faaCertTypesHeld: v.optional(
      v.array(
        v.union(
          v.literal("145"),
          v.literal("121"),
          v.literal("125"),
          v.literal("129"),
          v.literal("133"),
          v.literal("135"),
          v.literal("137"),
          v.literal("141"),
          v.literal("142"),
          v.literal("147"),
          v.literal("91K"),
          v.literal("91LOA"),
        ),
      ),
    ),
    part65Authorizations: v.optional(v.array(v.string())),
    // ── EASA Form 3 / approvals ──
    easaApprovalRef: v.optional(v.string()),
    easaCompetentAuthority: v.optional(v.string()),
    easaPart145Expiry: v.optional(v.string()),
    easaPartCamoRef: v.optional(v.string()),
    easaPartCaoRef: v.optional(v.string()),
    easaPart147Ref: v.optional(v.string()),
    easaPart21Ref: v.optional(v.string()),
    easaLineMaintenanceBases: v.optional(v.array(v.string())),
    easaForm4PostHolders: v.optional(
      v.array(
        v.object({
          roleId: v.string(),
          name: v.string(),
          email: v.optional(v.string()),
        }),
      ),
    ),
    // ── Quality / trade / SMS program tags (structured) ──
    qualityStandards: v.optional(v.array(v.string())),
    isbaoLevel: v.optional(v.string()),
    itarRegistered: v.optional(v.boolean()),
    dfarsCompliant: v.optional(v.boolean()),
    icaoStateOfRegistry: v.optional(v.string()),
    sourceAssessmentId: v.optional(v.id("assessments")),
    importedFromAssessmentAt: v.optional(v.string()),
    lastSyncedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_companyId", ["companyId"]),

  certificateProfiles: defineTable({
    /** Set for legacy/personal scope; nullable when profile is company-scoped. */
    projectId: v.optional(v.id("projects")),
    /** Set when profile is tenant-wide and shared across company projects. */
    companyId: v.optional(v.id("companies")),
    /** Optional linkage to the legacy profile row used for compatibility migration. */
    entityProfileId: v.optional(v.id("entityProfiles")),
    userId: v.string(),
    /** Deterministic profile key, e.g. "faa:part145:default". */
    profileCode: v.string(),
    authority: certificateAuthorityValidator,
    certificateType: certificateTypeValidator,
    status: certificateProfileStatusValidator,
    certificateMetadata: v.optional(
      v.object({
        certificateNumber: v.optional(v.string()),
        issuedDate: v.optional(v.string()),
        expiryDate: v.optional(v.string()),
        lastAmendmentDate: v.optional(v.string()),
        surveillanceAnchorDate: v.optional(v.string()),
      }),
    ),
    operationalScope: v.optional(
      v.object({
        scopeKey: v.optional(v.string()),
        operationClass: v.optional(v.string()),
        lineMaintenance: v.optional(v.boolean()),
        baseMaintenance: v.optional(v.boolean()),
        componentMaintenance: v.optional(v.boolean()),
        avionicsMaintenance: v.optional(v.boolean()),
        geography: v.optional(v.string()),
      }),
    ),
    manualSet: v.optional(
      v.array(
        v.object({
          manualType: v.string(),
          manualId: v.optional(v.id("manuals")),
          revision: v.optional(v.string()),
        }),
      ),
    ),
    obligationSetVersion: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_companyId", ["companyId"])
    .index("by_entityProfileId", ["entityProfileId"])
    .index("by_companyId_certificateType", ["companyId", "certificateType"]),

  obligationSetDefinitions: defineTable({
    profileCode: v.string(),
    authority: certificateAuthorityValidator,
    certificateType: certificateTypeValidator,
    version: v.string(),
    rules: v.array(
      v.object({
        ruleId: v.string(),
        sourceReference: v.optional(v.string()),
        intervalType: v.optional(v.string()),
        intervalValue: v.optional(v.number()),
        gracePolicy: v.optional(v.string()),
        anchorPolicy: v.optional(v.string()),
        defaultOwnerRole: v.optional(v.string()),
        escalationPolicy: v.optional(v.string()),
        evidenceRequirement: v.optional(v.string()),
        createsChecklistTemplate: v.optional(v.boolean()),
        reportSectionMapping: v.optional(v.string()),
        severity: v.optional(
          v.union(
            v.literal("critical"),
            v.literal("major"),
            v.literal("minor"),
            v.literal("observation"),
          ),
        ),
      }),
    ),
    isActive: v.boolean(),
    createdAt: v.string(),
    createdBy: v.string(),
    updatedAt: v.string(),
  })
    .index("by_profileCode", ["profileCode"])
    .index("by_certificateType_version", ["certificateType", "version"]),

  entityClassRatings: defineTable({
    /** Link back to owning profile row. */
    entityProfileId: v.id("entityProfiles"),
    /** Optional project scope (legacy/personal). */
    projectId: v.optional(v.id("projects")),
    /** Optional org scope (tenant-wide shared profile). */
    companyId: v.optional(v.id("companies")),
    /** Regulatory authority (defaults to FAA for legacy rows). */
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    /** FAA class rating family or EASA scope code (e.g. A1, C13). */
    category: v.string(),
    /** Class number within category (typically 1-4 for FAA; 1 when using EASA code as category). */
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
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
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

  entityOpSpecs: defineTable({
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    /**
     * FAA certificate part the paragraph is issued under. Required for new rows;
     * optional on the schema for backward compatibility with pre-migration data
     * (treated as "145" until `migrateCertParts` stamps them).
     */
    certPart: v.optional(
      v.union(
        v.literal("145"),
        v.literal("121"),
        v.literal("125"),
        v.literal("129"),
        v.literal("133"),
        v.literal("135"),
        v.literal("137"),
        v.literal("141"),
        v.literal("142"),
        v.literal("147"),
        v.literal("91K"),
        v.literal("91LOA"),
      ),
    ),
    /** Document family: OpSpec / MSpec / TSpec / LOA. Derivable from certPart. */
    docType: v.optional(
      v.union(v.literal("opspec"), v.literal("mspec"), v.literal("tspec"), v.literal("loa")),
    ),
    paragraph: v.string(),
    title: v.optional(v.string()),
    acceptedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_entityProfileId", ["entityProfileId"])
    .index("by_entityProfileId_paragraph", ["entityProfileId", "paragraph"])
    .index("by_entityProfileId_certPart_paragraph", ["entityProfileId", "certPart", "paragraph"])
    .index("by_companyId", ["companyId"])
    .index("by_projectId", ["projectId"]),

  entityLimitedRatings: defineTable({
    entityProfileId: v.id("entityProfiles"),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    ratingKind: v.string(),
    articleDescription: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    authorizedFunctions: v.array(v.string()),
    easaCategory: v.optional(v.string()),
    easaRating: v.optional(v.string()),
    limitations: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    normalizedTokens: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_entityProfileId", ["entityProfileId"])
    .index("by_companyId", ["companyId"])
    .index("by_projectId", ["projectId"]),

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
    certificateProfileId: v.optional(v.id("certificateProfiles")),
    obligationSetVersion: v.optional(v.string()),
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
    .index("by_checklistSeriesId", ["checklistSeriesId"])
    .index("by_certificateProfileId", ["certificateProfileId"]),

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
    sourceSectionIdOrRef: v.optional(v.string()),
    sourceRevisionId: v.optional(v.string()),
    obligationRuleId: v.optional(v.string()),
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
    .index("by_projectId_framework", ["projectId", "framework"])
    .index("by_obligationRuleId", ["obligationRuleId"]),

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
    certificateProfileId: v.optional(v.id("certificateProfiles")),
    obligationRuleId: v.optional(v.string()),
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
    /** ATA chapter when item was created from a manual section (e.g. "05"). */
    ataChapter: v.optional(v.union(v.string(), v.null())),
    sourceSectionIdOrRef: v.optional(v.union(v.string(), v.null())),
    sourceRevisionId: v.optional(v.union(v.string(), v.null())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_certificateProfileId", ["projectId", "certificateProfileId"]),

  libraryFolders: defineTable({
    companyId: v.id("companies"),
    parentFolderId: v.optional(v.id("libraryFolders")),
    name: v.string(),
    sortOrder: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_parent", ["companyId", "parentFolderId"]),

  /** Company-scoped technical publications (MM, IPC, wiring); document row holds file + extracted text. */
  technicalPublications: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"), // project where the backing document was uploaded
    documentId: v.id("documents"),
    folderId: v.optional(v.id("libraryFolders")),
    title: v.string(),
    publicationType: v.union(
      v.literal("maintenance_manual"),
      v.literal("parts_catalog"),
      v.literal("wiring_diagram"),
      v.literal("logbook_scan"),
      v.literal("other"),
    ),
    makeModel: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    revisionDate: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
    aircraftIds: v.optional(v.array(v.id("aircraftAssets"))),
    /** Optional logical grouping (e.g. all 1,500+ XML files that make up one OEM manual). */
    manualGroupId: v.optional(v.id("manualGroups")),
    uploadedBy: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_publicationType", ["companyId", "publicationType"])
    .index("by_companyId_folder", ["companyId", "folderId"])
    .index("by_documentId", ["documentId"])
    .index("by_projectId", ["projectId"])
    .index("by_manualGroupId", ["manualGroupId"]),

  /** A logical bundle of technical publications that should be selectable as one unit
   *  (e.g. a single OEM maintenance manual delivered as 1,500+ XML chapter files). */
  manualGroups: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    publicationType: v.optional(
      v.union(
        v.literal("maintenance_manual"),
        v.literal("parts_catalog"),
        v.literal("wiring_diagram"),
        v.literal("logbook_scan"),
        v.literal("other"),
      ),
    ),
    manufacturer: v.optional(v.string()),
    makeModel: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_companyId", ["companyId"]),

  /** ATA-style outline for a technical publication (TOC / chapter detection). */
  publicationSections: defineTable({
    publicationId: v.id("technicalPublications"),
    ataChapter: v.string(),
    ataSection: v.optional(v.string()),
    title: v.string(),
    startPage: v.number(),
    endPage: v.number(),
    depth: v.number(),
    chunkIds: v.optional(v.array(v.id("documentChunks"))),
    parentSectionId: v.optional(v.id("publicationSections")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_publicationId", ["publicationId"])
    .index("by_publicationId_ataChapter", ["publicationId", "ataChapter"]),

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
    // Avianis sync fields
    avianisAircraftId: v.optional(v.string()),
    currentTotalTime: v.optional(v.number()),
    currentTotalCycles: v.optional(v.number()),
    currentTotalLandings: v.optional(v.number()),
    currentAsOfDate: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_tailNumber", ["tailNumber"])
    .index("by_avianisAircraftId", ["avianisAircraftId"]),

  aircraftDiscrepancies: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    avianisExternalId: v.optional(v.string()),
    source: v.string(), // "avianis" | "manual"
    status: v.string(), // "open" | "deferred" | "resolved" | "closed"
    category: v.optional(v.string()), // "squawk" | "mel" | "cdl" | "other"
    ataChapter: v.optional(v.string()),
    melItem: v.optional(v.string()),
    description: v.string(),
    location: v.optional(v.string()),
    partNumbers: v.optional(v.array(v.string())),
    discoveredAt: v.optional(v.string()),
    discoveredAtTotalTime: v.optional(v.number()),
    deferralCategory: v.optional(v.string()),
    deferralExpiresAt: v.optional(v.string()),
    research: v.optional(v.any()),
    researchedAt: v.optional(v.number()),
    logbookDraftEntryId: v.optional(v.id("logbookDraftEntries")),
    raw: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_aircraftId", ["aircraftId"])
    .index("by_avianisExternalId", ["avianisExternalId"])
    .index("by_projectId_status", ["projectId", "status"]),

  logbookDraftEntries: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    /** Optional: drafts produced from a scan have this; drafts authored from a
     * discrepancy / manual entry leave it unset. */
    sourceDocumentId: v.optional(v.id("documents")),
    /** Optional link back to an aircraft discrepancy when this draft came from
     * the "Use as log entry" workflow on the Fleet view. */
    sourceDiscrepancyId: v.optional(v.id("aircraftDiscrepancies")),
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
    /** Physical log volume: airframe, engine_1, prop_1, apu, other. */
    bookVolume: v.optional(v.string()),
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
    /** Physical log volume: airframe, engine_1, prop_1, apu, other. */
    bookVolume: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_aircraftId", ["aircraftId"])
    .index("by_aircraftId_entryDate", ["aircraftId", "entryDate"])
    .index("by_sourceDocumentId", ["sourceDocumentId"])
    .index("by_aircraftId_entryType", ["aircraftId", "entryType"])
    .index("by_aircraftId_bookVolume", ["aircraftId", "bookVolume"]),

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
    /**
     * Legacy library sync fields (older clients). Kept optional so existing production rows
     * still validate after DCT refactor; new code may omit these.
     */
    dctLibraryTrackingMode: v.optional(v.union(v.literal("latest"), v.literal("pinned"))),
    lastDctLibrarySyncAt: v.optional(v.string()),
    lastDctLibrarySyncSignatures: v.optional(v.array(v.string())),
    updatedAt: v.string(),
  }).index("by_projectId", ["projectId"]),

  /** One row per ingested DCT XML. */
  dctToolDocuments: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    /** Legacy values may include "drs"; new rows use "xml". */
    source: v.optional(v.string()),
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
    severity: v.optional(
      v.union(
        v.literal("critical"),
        v.literal("major"),
        v.literal("minor"),
        v.literal("observation"),
      ),
    ),
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
      /** @deprecated No longer written; retained for historical rows. */
      v.literal("drs_sync"),
      v.literal("scheduled_tick"),
      v.literal("compare_run"),
      /** @deprecated No longer written; retained for historical rows. */
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

  /**
   * Server-orchestrated DCT traceability runs. The Convex action
   * `dctTraceabilityRunner.startTraceabilityRun` owns the batch loop end-to-end
   * so closing the tab no longer aborts an in-flight run. The UI subscribes via
   * `getActiveTraceabilityRun` for live progress and writes `cancelRequested`
   * to abort cooperatively.
   */
  dctTraceabilityRuns: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    total: v.number(),
    processed: v.number(),
    persisted: v.number(),
    /** Rows the model returned but the persist mutation failed on (after retry). User must re-run. */
    persistFailed: v.number(),
    /** Batches whose model output was unparseable or whose API call hard-failed. */
    parseFailed: v.number(),
    /**
     * Consecutive resume/retry attempts that made no progress. Reset to 0 whenever
     * `processed` advances; once it exceeds the cap the run is failed so a stuck
     * run can't keep firing paid Claude batches forever (in-band retry + cron).
     */
    stallRetries: v.optional(v.number()),
    model: v.string(),
    agentId: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    /** Bumped every batch so a watchdog can detect stuck runs. */
    lastHeartbeatAt: v.string(),
    /** UI sets this to request a cooperative cancel; the action polls it between batches. */
    cancelRequested: v.optional(v.boolean()),
    error: v.optional(v.string()),
    /** First failing model response (truncated) so the UI can surface "why didn't this work". */
    lastBadResponse: v.optional(v.string()),
    /**
     * Frozen run config for chunked execution. Each scheduled chunk reads
     * `processed` and continues until `total` is reached.
     */
    runPayload: v.optional(
      v.object({
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
      }),
    ),
  }).index("by_projectId", ["projectId"]),

  /** Stripe customer mapped to a billing owner (user or company). */
  billingCustomers: defineTable({
    ownerType: v.union(v.literal("user"), v.literal("company")),
    /** Clerk userId when ownerType=user; companies Id string when ownerType=company */
    ownerId: v.string(),
    stripeCustomerId: v.string(),
    email: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_owner", ["ownerType", "ownerId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  billingSubscriptions: defineTable({
    billingCustomerId: v.id("billingCustomers"),
    ownerType: v.union(v.literal("user"), v.literal("company")),
    ownerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    planId: v.string(),
    status: v.string(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
    latestInvoiceId: v.optional(v.string()),
    dunningStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("past_due"),
        v.literal("unpaid"),
        v.literal("canceled"),
      ),
    ),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_billingCustomerId", ["billingCustomerId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"])
    .index("by_owner", ["ownerType", "ownerId"])
    .index("by_status", ["status"]),

  billingInvoices: defineTable({
    billingCustomerId: v.id("billingCustomers"),
    stripeInvoiceId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.string(),
    amountDue: v.number(),
    amountPaid: v.number(),
    currency: v.string(),
    hostedInvoiceUrl: v.optional(v.string()),
    invoicePdf: v.optional(v.string()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_billingCustomerId", ["billingCustomerId"])
    .index("by_stripeInvoiceId", ["stripeInvoiceId"]),

  /** Idempotent Stripe webhook event log. */
  billingEvents: defineTable({
    stripeEventId: v.string(),
    eventType: v.string(),
    status: v.union(
      v.literal("processed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    errorMessage: v.optional(v.string()),
    ownerType: v.optional(v.union(v.literal("user"), v.literal("company"))),
    ownerId: v.optional(v.string()),
    createdAt: v.string(),
    processedAt: v.optional(v.string()),
  })
    .index("by_stripeEventId", ["stripeEventId"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),
});
