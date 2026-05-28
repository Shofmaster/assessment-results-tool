/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { anyApi, componentsGeneric } from "convex/server";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: {
  aircraftAssets: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        baselineAsOfDate?: string;
        baselineTotalCycles?: number;
        baselineTotalLandings?: number;
        baselineTotalTime?: number;
        make?: string;
        model?: string;
        notes?: string;
        operator?: string;
        projectId: Id<"projects">;
        serial?: string;
        tailNumber: string;
        year?: number;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { aircraftId: Id<"aircraftAssets"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { aircraftId: Id<"aircraftAssets"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        baselineAsOfDate?: string;
        baselineTotalCycles?: number;
        baselineTotalLandings?: number;
        baselineTotalTime?: number;
        make?: string;
        model?: string;
        notes?: string;
        operator?: string;
        serial?: string;
        status?: string;
        tailNumber?: string;
        year?: number;
      },
      any
    >;
  };
  aircraftComponents: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        aircraftCyclesAtInstall?: number;
        aircraftId: Id<"aircraftAssets">;
        aircraftTimeAtInstall?: number;
        ataChapter?: string;
        cyclesAtInstall?: number;
        description: string;
        installDate?: string;
        installLogbookEntryId?: Id<"logbookEntries">;
        isLifeLimited?: boolean;
        lifeLimit?: number;
        lifeLimitUnit?: string;
        partNumber: string;
        position?: string;
        projectId: Id<"projects">;
        serialNumber?: string;
        tsnAtInstall?: number;
        tsoAtInstall?: number;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { componentId: Id<"aircraftComponents"> },
      any
    >;
    listByAircraft: FunctionReference<
      "query",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        projectId: Id<"projects">;
        statusFilter?: string;
      },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { componentId: Id<"aircraftComponents"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        aircraftCyclesAtInstall?: number;
        aircraftTimeAtInstall?: number;
        ataChapter?: string;
        componentId: Id<"aircraftComponents">;
        cyclesAtInstall?: number;
        description?: string;
        installDate?: string;
        isLifeLimited?: boolean;
        lifeLimit?: number;
        lifeLimitUnit?: string;
        partNumber?: string;
        position?: string;
        removeDate?: string;
        removeLogbookEntryId?: Id<"logbookEntries">;
        serialNumber?: string;
        status?: string;
        tsnAtInstall?: number;
        tsoAtInstall?: number;
      },
      any
    >;
  };
  analyses: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        analysisDate: string;
        assessmentId: string;
        combinedInsights?: any;
        companyName: string;
        compliance: any;
        documentAnalyses?: any;
        findings: any;
        projectId: Id<"projects">;
        recommendations: any;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { analysisId: Id<"analyses"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
  };
  analytics: {
    getComplianceTrend: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    getCrossProjectSummary: FunctionReference<"query", "public", {}, any>;
    getProjectStats: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
  };
  assessments: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        data: any;
        importedAt: string;
        originalId: string;
        projectId: Id<"projects">;
      },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { assessmentId: Id<"assessments"> },
      any
    >;
  };
  auditChecklists: {
    addManualItem: FunctionReference<
      "mutation",
      "public",
      {
        checklistRunId: Id<"auditChecklistRuns">;
        description?: string;
        dueDate?: string;
        evidenceHint?: string;
        notes?: string;
        owner?: string;
        requirementRef?: string;
        section: string;
        severity: "critical" | "major" | "minor" | "observation";
        title: string;
      },
      any
    >;
    createRunFromSelectedDocuments: FunctionReference<
      "mutation",
      "public",
      {
        framework: string;
        frameworkLabel: string;
        generatedFromTemplateVersion: string;
        items: Array<{
          description?: string;
          dueDate?: string;
          evidenceHint?: string;
          notes?: string;
          owner?: string;
          requirementRef?: string;
          section: string;
          severity: "critical" | "major" | "minor" | "observation";
          title: string;
        }>;
        name?: string;
        notes?: string;
        profileId?: Id<"entityProfiles">;
        projectId: Id<"projects">;
        selectedProjectDocumentIds?: Array<Id<"documents">>;
        selectedSharedReferenceDocumentIds?: Array<
          Id<"sharedReferenceDocuments">
        >;
        subtypeId?: string;
        subtypeLabel?: string;
      },
      any
    >;
    createRunFromTemplate: FunctionReference<
      "mutation",
      "public",
      {
        framework: string;
        frameworkLabel: string;
        generatedFromTemplateVersion: string;
        items: Array<{
          description?: string;
          dueDate?: string;
          evidenceHint?: string;
          notes?: string;
          owner?: string;
          requirementRef?: string;
          section: string;
          severity: "critical" | "major" | "minor" | "observation";
          title: string;
        }>;
        name?: string;
        notes?: string;
        profileId?: Id<"entityProfiles">;
        projectId: Id<"projects">;
        subtypeId?: string;
        subtypeLabel?: string;
      },
      any
    >;
    createRunFromTemplateAndLibrary: FunctionReference<
      "mutation",
      "public",
      {
        framework: string;
        frameworkLabel: string;
        generatedFromTemplateVersion: string;
        items: Array<{
          description?: string;
          dueDate?: string;
          evidenceHint?: string;
          notes?: string;
          owner?: string;
          requirementRef?: string;
          section: string;
          severity: "critical" | "major" | "minor" | "observation";
          title: string;
        }>;
        name?: string;
        notes?: string;
        profileId?: Id<"entityProfiles">;
        projectId: Id<"projects">;
        selectedProjectDocumentIds?: Array<Id<"documents">>;
        selectedSharedReferenceDocumentIds?: Array<
          Id<"sharedReferenceDocuments">
        >;
        subtypeId?: string;
        subtypeLabel?: string;
      },
      any
    >;
    deleteItem: FunctionReference<
      "mutation",
      "public",
      { checklistItemId: Id<"auditChecklistItems"> },
      any
    >;
    deleteRun: FunctionReference<
      "mutation",
      "public",
      { checklistRunId: Id<"auditChecklistRuns"> },
      any
    >;
    escalateItemToIssue: FunctionReference<
      "mutation",
      "public",
      { checklistItemId: Id<"auditChecklistItems"> },
      any
    >;
    listCustomTemplateItems: FunctionReference<
      "query",
      "public",
      { framework: string; projectId: Id<"projects">; subtypeId?: string },
      any
    >;
    listItemsByRun: FunctionReference<
      "query",
      "public",
      { checklistRunId: Id<"auditChecklistRuns"> },
      any
    >;
    listRunsByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    saveCustomTemplateItems: FunctionReference<
      "mutation",
      "public",
      {
        framework: string;
        items: Array<{
          description?: string;
          evidenceHint?: string;
          notes?: string;
          requirementRef?: string;
          severity: "critical" | "major" | "minor" | "observation";
          title: string;
        }>;
        projectId: Id<"projects">;
        subtypeId?: string;
        subtypeLabel?: string;
      },
      any
    >;
    updateItem: FunctionReference<
      "mutation",
      "public",
      {
        checklistItemId: Id<"auditChecklistItems">;
        dueDate?: string;
        intervalDays?: number;
        intervalMonths?: number;
        lastPerformedAt?: string;
        notes?: string;
        owner?: string;
        requirementRef?: string;
        severity?: "critical" | "major" | "minor" | "observation";
        signoffCertNumber?: string;
        signoffCertType?: string;
        signoffDate?: string;
        signoffName?: string;
        status?: "not_started" | "in_progress" | "complete" | "blocked";
        title?: string;
      },
      any
    >;
    updateRun: FunctionReference<
      "mutation",
      "public",
      {
        checklistPurpose?: "pre_audit" | "recurring_ops" | "event";
        checklistRunId: Id<"auditChecklistRuns">;
        name?: string;
        nextCycleDue?: string;
        notes?: string;
        runIntervalDays?: number;
        runIntervalMonths?: number;
        status?: "draft" | "active" | "completed" | "archived";
      },
      any
    >;
  };
  auditIntelligenceActions: {
    synthesizePatterns: FunctionReference<"action", "public", {}, any>;
  };
  avianisIntegration: {
    _currentUserId: FunctionReference<"query", "public", {}, any>;
    createManualDiscrepancy: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        ataChapter?: string;
        description: string;
        location?: string;
        melItem?: string;
        partNumbers?: Array<string>;
        projectId: Id<"projects">;
      },
      any
    >;
    getDiscrepancy: FunctionReference<
      "query",
      "public",
      { discrepancyId: Id<"aircraftDiscrepancies"> },
      any
    >;
    getStatus: FunctionReference<"query", "public", {}, any>;
    listAircraftForProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listDiscrepanciesForProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    syncAll: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    testConnection: FunctionReference<"action", "public", {}, any>;
  };
  billing: {
    adminListBillingSummary: FunctionReference<
      "query",
      "public",
      { limit?: number; statusFilter?: string },
      any
    >;
    adminListFailedEvents: FunctionReference<
      "query",
      "public",
      { limit?: number },
      any
    >;
    getMyEntitlements: FunctionReference<
      "query",
      "public",
      { companyId?: Id<"companies"> },
      any
    >;
    getOverview: FunctionReference<
      "query",
      "public",
      { ownerId: string; ownerType: "user" | "company" },
      any
    >;
    listInvoices: FunctionReference<
      "query",
      "public",
      { limit?: number; ownerId: string; ownerType: "user" | "company" },
      any
    >;
    listPlans: FunctionReference<"query", "public", {}, any>;
    markEntitlementManualOverride: FunctionReference<
      "mutation",
      "public",
      { ownerId: string; ownerType: "user" | "company" },
      any
    >;
  };
  billingActions: {
    cancelSubscription: FunctionReference<
      "action",
      "public",
      {
        cancelAtPeriodEnd?: boolean;
        ownerId: string;
        ownerType: "user" | "company";
      },
      any
    >;
    changeSubscriptionPlan: FunctionReference<
      "action",
      "public",
      {
        ownerId: string;
        ownerType: "user" | "company";
        planId: "basic" | "pro" | "enterprise";
      },
      any
    >;
    createSetupIntentForPaymentMethod: FunctionReference<
      "action",
      "public",
      {
        email: string;
        name?: string;
        ownerId: string;
        ownerType: "user" | "company";
      },
      any
    >;
    createSubscriptionPayment: FunctionReference<
      "action",
      "public",
      {
        email: string;
        name?: string;
        ownerId: string;
        ownerType: "user" | "company";
        planId: "basic" | "pro" | "enterprise";
      },
      any
    >;
    reactivateSubscription: FunctionReference<
      "action",
      "public",
      { ownerId: string; ownerType: "user" | "company" },
      any
    >;
    syncOwnerFromStripe: FunctionReference<
      "action",
      "public",
      { ownerId: string; ownerType: "user" | "company" },
      any
    >;
  };
  certificateProfiles: {
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listObligationDefinitionsByProfile: FunctionReference<
      "query",
      "public",
      { profileCode: string },
      any
    >;
    resolveForProject: FunctionReference<
      "query",
      "public",
      { legacyProfileId?: Id<"entityProfiles">; projectId: Id<"projects"> },
      any
    >;
    seedDefaultObligationSets: FunctionReference<"mutation", "public", {}, any>;
    upsertObligationSetDefinition: FunctionReference<
      "mutation",
      "public",
      {
        authority: "faa" | "easa" | "isbao" | "as9100" | "icao" | "other";
        certificateType:
          | "part145"
          | "part135"
          | "part121"
          | "part125"
          | "part129"
          | "part133"
          | "part137"
          | "part141"
          | "part142"
          | "part147"
          | "part91k"
          | "part91loa"
          | "easa145"
          | "isbao"
          | "as9100"
          | "custom";
        isActive: boolean;
        profileCode: string;
        rules: Array<{
          anchorPolicy?: string;
          createsChecklistTemplate?: boolean;
          defaultOwnerRole?: string;
          escalationPolicy?: string;
          evidenceRequirement?: string;
          gracePolicy?: string;
          intervalType?: string;
          intervalValue?: number;
          reportSectionMapping?: string;
          ruleId: string;
          severity?: "critical" | "major" | "minor" | "observation";
          sourceReference?: string;
        }>;
        version: string;
      },
      any
    >;
  };
  checklistSeries: {
    closeOccurrence: FunctionReference<
      "mutation",
      "public",
      { lateReason?: string; occurrenceId: Id<"checklistOccurrences"> },
      any
    >;
    createSeriesAndLinkRun: FunctionReference<
      "mutation",
      "public",
      {
        checklistRunId: Id<"auditChecklistRuns">;
        intervalDays?: number;
        intervalMonths?: number;
        isRecurring: boolean;
        name: string;
        plannedDueDate?: string;
        purpose: "pre_audit" | "recurring_ops" | "event";
      },
      any
    >;
    getOccurrenceForRun: FunctionReference<
      "query",
      "public",
      { checklistRunId: Id<"auditChecklistRuns"> },
      any
    >;
    getSeriesForRun: FunctionReference<
      "query",
      "public",
      { checklistRunId: Id<"auditChecklistRuns"> },
      any
    >;
    listOccurrencesBySeries: FunctionReference<
      "query",
      "public",
      { seriesId: Id<"checklistSeries"> },
      any
    >;
    listSeriesByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    startNextCycle: FunctionReference<
      "mutation",
      "public",
      {
        cycleLabel?: string;
        plannedDueDate?: string;
        seriesId: Id<"checklistSeries">;
      },
      any
    >;
    updateOpenOccurrencePlannedDue: FunctionReference<
      "mutation",
      "public",
      { occurrenceId: Id<"checklistOccurrences">; plannedDueDate: string },
      any
    >;
    updateSeries: FunctionReference<
      "mutation",
      "public",
      {
        intervalDays?: number;
        intervalMonths?: number;
        isRecurring?: boolean;
        name?: string;
        notes?: string;
        seriesId: Id<"checklistSeries">;
      },
      any
    >;
  };
  companies: {
    addMember: FunctionReference<
      "mutation",
      "public",
      {
        companyId: Id<"companies">;
        role: "company_admin" | "company_manager" | "company_user";
        status?: "active" | "invited" | "suspended";
        userId: string;
      },
      any
    >;
    assignSupportUser: FunctionReference<
      "mutation",
      "public",
      { companyId: Id<"companies">; isActive?: boolean; supportUserId: string },
      any
    >;
    create: FunctionReference<
      "mutation",
      "public",
      { initialAdminUserId?: string; name: string; slug?: string },
      any
    >;
    getFeaturePolicy: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    getFeaturePolicyByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listAll: FunctionReference<"query", "public", {}, any>;
    listForCurrentUser: FunctionReference<"query", "public", {}, any>;
    listMembers: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listMyAdminCompanies: FunctionReference<"query", "public", {}, any>;
    listSummariesForStaff: FunctionReference<"query", "public", {}, any>;
    listSupportAssignments: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listWhereCanManageProjects: FunctionReference<"query", "public", {}, any>;
    removeMember: FunctionReference<
      "mutation",
      "public",
      { companyId: Id<"companies">; membershipId: Id<"companyMemberships"> },
      any
    >;
    removeSupportAssignment: FunctionReference<
      "mutation",
      "public",
      {
        assignmentId: Id<"companySupportAssignments">;
        companyId: Id<"companies">;
      },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        companyId: Id<"companies">;
        isActive?: boolean;
        name?: string;
        slug?: string;
      },
      any
    >;
    upsertFeaturePolicy: FunctionReference<
      "mutation",
      "public",
      {
        carLifecycleWebhookSecret?: string | null;
        carLifecycleWebhookUrl?: string | null;
        companyId: Id<"companies">;
        enabledAgents?: Array<string> | null;
        enabledFeatures?: Array<string> | null;
        enabledFrameworks?: Array<string> | null;
        forceCompanyContextDefault?: boolean | null;
        logbookEnabled?: boolean;
        logbookEntitlementMode?: "addon" | "standalone" | null;
      },
      any
    >;
  };
  complianceFindings: {
    addBatch: FunctionReference<
      "mutation",
      "public",
      {
        findings: Array<{
          aircraftId: Id<"aircraftAssets">;
          citation: string;
          description: string;
          evidenceSnippet?: string;
          findingType: string;
          logbookEntryId?: Id<"logbookEntries">;
          ruleId: string;
          severity: string;
          title: string;
        }>;
        projectId: Id<"projects">;
      },
      any
    >;
    convertToIssue: FunctionReference<
      "mutation",
      "public",
      { findingId: Id<"complianceFindings">; issueId: Id<"entityIssues"> },
      any
    >;
    listByAircraft: FunctionReference<
      "query",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        projectId: Id<"projects">;
        statusFilter?: string;
      },
      any
    >;
    listByEntry: FunctionReference<
      "query",
      "public",
      { entryId: Id<"logbookEntries"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { findingId: Id<"complianceFindings"> },
      any
    >;
    updateStatus: FunctionReference<
      "mutation",
      "public",
      {
        findingId: Id<"complianceFindings">;
        resolutionNote?: string;
        status: string;
      },
      any
    >;
  };
  complianceRules: {
    getByRuleId: FunctionReference<"query", "public", { ruleId: string }, any>;
    listAll: FunctionReference<"query", "public", {}, any>;
    listByPack: FunctionReference<
      "query",
      "public",
      { regulatoryPack: string },
      any
    >;
    seedPart43And91: FunctionReference<"mutation", "public", {}, any>;
    seedRulePack: FunctionReference<
      "mutation",
      "public",
      {
        rules: Array<{
          cfrPart: string;
          cfrSection: string;
          checkType: string;
          citation: string;
          description: string;
          effectiveDate?: string;
          regulatoryPack: string;
          requiredFields: Array<string>;
          ruleId: string;
          severity: string;
          title: string;
          version: number;
        }>;
      },
      any
    >;
    upsert: FunctionReference<
      "mutation",
      "public",
      {
        cfrPart: string;
        cfrSection: string;
        checkType: string;
        citation: string;
        description: string;
        effectiveDate?: string;
        regulatoryPack: string;
        requiredFields: Array<string>;
        ruleId: string;
        severity: string;
        supersededDate?: string;
        title: string;
        version: number;
      },
      any
    >;
  };
  dctCompliance: {
    bulkApplyTraceabilityResults: FunctionReference<
      "mutation",
      "public",
      {
        projectId: Id<"projects">;
        results: Array<{
          applicabilitySource?: string;
          applicabilityState?: "applicable" | "unsure" | "not_applicable";
          comparisonId: Id<"dctComparisons">;
          evidenceSnippet?: string;
          lowConfidenceApplicability?: boolean;
          rationale?: string;
          severity?: "critical" | "major" | "minor" | "observation";
          status: "pending" | "aligned" | "gap" | "mismatch";
          underReviewDocumentId?: Id<"documents">;
        }>;
      },
      any
    >;
    bulkSetMatrixFields: FunctionReference<
      "mutation",
      "public",
      {
        applicabilitySource?: string;
        applicabilityState?: "applicable" | "unsure" | "not_applicable";
        comparisonIds: Array<Id<"dctComparisons">>;
        projectId: Id<"projects">;
        resolved?: boolean;
        severity?: "critical" | "major" | "minor" | "observation";
        status?: "pending" | "aligned" | "gap" | "mismatch";
      },
      any
    >;
    cancelTraceabilityRun: FunctionReference<
      "mutation",
      "public",
      { runId: Id<"dctTraceabilityRuns"> },
      any
    >;
    completeScheduledCheck: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    createReport: FunctionReference<
      "mutation",
      "public",
      {
        markdownBody?: string;
        projectId: Id<"projects">;
        stats?: any;
        title: string;
        verdict: "pass" | "conditional" | "fail" | "pending";
      },
      any
    >;
    getActiveTraceabilityRun: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    getProjectMetrics: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    getSummary: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    ingestFromParsedLibrary: FunctionReference<
      "mutation",
      "public",
      { contentHashes?: Array<string>; projectId: Id<"projects"> },
      any
    >;
    listComparisons: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listComparisonsEnriched: FunctionReference<
      "query",
      "public",
      { limit?: number; projectId: Id<"projects"> },
      any
    >;
    listParsedLibraryDocsByCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listQuestionsForDocument: FunctionReference<
      "query",
      "public",
      { dctDocumentId: Id<"dctToolDocuments">; projectId: Id<"projects"> },
      any
    >;
    listReports: FunctionReference<
      "query",
      "public",
      { limit?: number; projectId: Id<"projects"> },
      any
    >;
    listRevisionChecks: FunctionReference<
      "query",
      "public",
      { limit?: number; projectId: Id<"projects"> },
      any
    >;
    listToolDocuments: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    refreshApplicability: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    resumeTraceabilityRun: FunctionReference<
      "mutation",
      "public",
      { runId: Id<"dctTraceabilityRuns"> },
      any
    >;
    updateComparison: FunctionReference<
      "mutation",
      "public",
      {
        applicabilityConfidence?: number;
        applicabilitySource?: string;
        applicabilityState?: "applicable" | "unsure" | "not_applicable";
        comparisonId: Id<"dctComparisons">;
        evidenceSnippet?: string;
        projectId: Id<"projects">;
        rationale?: string;
        resolved?: boolean;
        severity?: "critical" | "major" | "minor" | "observation";
        status: "pending" | "aligned" | "gap" | "mismatch";
        underReviewDocumentId?: Id<"documents">;
      },
      any
    >;
    upsertSettings: FunctionReference<
      "mutation",
      "public",
      {
        applicabilityMode?: "heuristics_only" | "structured_preferred";
        excludedPeerGroupSubstrings?: Array<string>;
        includedPeerGroupSubstrings?: Array<string>;
        projectId: Id<"projects">;
        scheduleIntervalDays?: number;
        selectedCapabilityIds?: Array<Id<"entityCapabilityList">>;
        selectedClassRatingIds?: Array<Id<"entityClassRatings">>;
        showAllDcts?: boolean;
      },
      any
    >;
  };
  dctDocumentChecks: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        completedAt?: string;
        findings?: any;
        model?: string;
        notes?: string;
        perspectiveAgentId?: string;
        projectId: Id<"projects">;
        scope?: string;
        startedAt?: string;
        status: "running" | "completed" | "failed";
        totals?: {
          aligned: number;
          critical: number;
          gap: number;
          major: number;
          minor: number;
          mismatch: number;
          observation: number;
          pending: number;
          questions: number;
        };
        verdict?: "pass" | "conditional" | "fail" | "pending";
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { checkId: Id<"dctDocumentChecks"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { limit?: number; projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { checkId: Id<"dctDocumentChecks"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        checkId: Id<"dctDocumentChecks">;
        completedAt?: string;
        findings?: any;
        model?: string;
        notes?: string;
        perspectiveAgentId?: string;
        scope?: string;
        status?: "running" | "completed" | "failed";
        totals?: {
          aligned: number;
          critical: number;
          gap: number;
          major: number;
          minor: number;
          mismatch: number;
          observation: number;
          pending: number;
          questions: number;
        };
        verdict?: "pass" | "conditional" | "fail" | "pending";
      },
      any
    >;
  };
  dctTraceabilityRunner: {
    startTraceabilityRun: FunctionReference<
      "action",
      "public",
      {
        agentId: string;
        applicabilityByComparisonId?: Array<{
          applicability: "applicable" | "unsure" | "not_applicable";
          comparisonId: string;
        }>;
        batchSize?: number;
        comparisonIds: Array<Id<"dctComparisons">>;
        docIds: Array<Id<"documents">>;
        lowConfidenceByComparisonId?: Array<{
          comparisonId: string;
          value: boolean;
        }>;
        model: string;
        projectId: Id<"projects">;
        systemPrompt: string;
      },
      any
    >;
  };
  discrepancyResearch: {
    acceptResearchAsLogbookDraft: FunctionReference<
      "action",
      "public",
      { discrepancyId: Id<"aircraftDiscrepancies"> },
      any
    >;
    research: FunctionReference<
      "action",
      "public",
      { discrepancyId: Id<"aircraftDiscrepancies"> },
      any
    >;
  };
  documentChunks: {
    backfillAll: FunctionReference<
      "action",
      "public",
      { companyId?: Id<"companies">; projectId?: Id<"projects"> },
      any
    >;
    indexSummary: FunctionReference<
      "action",
      "public",
      { companyId?: Id<"companies">; projectId?: Id<"projects"> },
      any
    >;
    reindexOne: FunctionReference<
      "action",
      "public",
      { documentId: Id<"documents"> },
      any
    >;
    search: FunctionReference<
      "action",
      "public",
      {
        categories?: Array<string>;
        companyId?: Id<"companies">;
        documentIds?: Array<Id<"documents">>;
        includeFullDocuments?: boolean;
        maxFullDocuments?: number;
        projectId?: Id<"projects">;
        query: string;
        topK?: number;
      },
      any
    >;
  };
  documentReviews: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        auditorIds?: Array<string>;
        batchId?: string;
        findings?: any;
        name?: string;
        notes?: string;
        projectId: Id<"projects">;
        referenceDocumentIds?: Array<Id<"documents">>;
        reviewScope?: string;
        sharedReferenceDocumentIds?: Array<Id<"sharedReferenceDocuments">>;
        status: string;
        underReviewDocumentId: Id<"documents">;
        verdict?: string;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { reviewId: Id<"documentReviews"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listByProjectAndUnderReview: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects">; underReviewDocumentId: Id<"documents"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { reviewId: Id<"documentReviews"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        auditorIds?: Array<string>;
        findings?: any;
        notes?: string;
        reviewId: Id<"documentReviews">;
        reviewScope?: string;
        status?: string;
        verdict?: string;
      },
      any
    >;
  };
  documentRevisions: {
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    set: FunctionReference<
      "mutation",
      "public",
      {
        projectId: Id<"projects">;
        revisions: Array<{
          category?: string;
          detectedRevision: string;
          documentName: string;
          documentType: string;
          isCurrentRevision?: boolean;
          lastCheckedAt?: string;
          latestKnownRevision: string;
          originalId: string;
          searchSummary: string;
          sourceDocumentId: string;
          status: string;
        }>;
      },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        category?: string;
        documentType?: string;
        isCurrentRevision?: boolean;
        lastCheckedAt?: string;
        latestKnownRevision?: string;
        revisionId: Id<"documentRevisions">;
        searchSummary?: string;
        status?: string;
      },
      any
    >;
  };
  documents: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        category: string;
        extractedAt: string;
        extractedText?: string;
        extractedTextStorageId?: Id<"_storage">;
        extractionMeta?: { backend: string; confidence?: number };
        mimeType?: string;
        name: string;
        path: string;
        projectId: Id<"projects">;
        size?: number;
        source: string;
        storageId?: Id<"_storage">;
      },
      any
    >;
    clear: FunctionReference<
      "mutation",
      "public",
      { category: string; projectId: Id<"projects"> },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { documentId: Id<"documents"> },
      any
    >;
    getExtractedTextOverflowUrl: FunctionReference<
      "query",
      "public",
      { documentId: Id<"documents"> },
      any
    >;
    getFileUrl: FunctionReference<
      "query",
      "public",
      { documentId: Id<"documents"> },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      { category?: string; companyId: Id<"companies"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { category?: string; projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"documents"> },
      any
    >;
    updateBinaryStorage: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"documents">; storageId: Id<"_storage"> },
      any
    >;
    updateCategory: FunctionReference<
      "mutation",
      "public",
      { category: string; documentId: Id<"documents"> },
      any
    >;
    updateExtractedText: FunctionReference<
      "mutation",
      "public",
      {
        documentId: Id<"documents">;
        extractedAt: string;
        extractedText: string;
        extractedTextStorageId?: Id<"_storage"> | null;
        extractionMeta?: { backend: string; confidence?: number };
        mimeType?: string;
        size?: number;
      },
      any
    >;
  };
  entityCapabilityList: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        articleDescription: string;
        authority?: "faa" | "easa" | "other";
        authorizedFunctions: Array<string>;
        clNumber?: string;
        companyId?: Id<"companies">;
        isActive?: boolean;
        make?: string;
        model?: string;
        notes?: string;
        partNumber?: string;
        projectId?: Id<"projects">;
        technicalDataRef?: string;
      },
      any
    >;
    bulkUpsert: FunctionReference<
      "mutation",
      "public",
      {
        companyId?: Id<"companies">;
        items: Array<{
          articleDescription: string;
          authority?: "faa" | "easa" | "other";
          authorizedFunctions: Array<string>;
          clNumber?: string;
          isActive?: boolean;
          make?: string;
          model?: string;
          notes?: string;
          partNumber?: string;
          technicalDataRef?: string;
        }>;
        projectId?: Id<"projects">;
        replaceAll?: boolean;
      },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      {
        capabilityId: Id<"entityCapabilityList">;
        companyId?: Id<"companies">;
        projectId?: Id<"projects">;
      },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        articleDescription?: string;
        authority?: "faa" | "easa" | "other";
        authorizedFunctions?: Array<string>;
        capabilityId: Id<"entityCapabilityList">;
        clNumber?: string;
        companyId?: Id<"companies">;
        isActive?: boolean;
        make?: string;
        model?: string;
        notes?: string;
        partNumber?: string;
        projectId?: Id<"projects">;
        technicalDataRef?: string;
      },
      any
    >;
  };
  entityClassRatings: {
    bulkUpsert: FunctionReference<
      "mutation",
      "public",
      {
        companyId?: Id<"companies">;
        items: Array<{
          authority?: "faa" | "easa" | "other";
          category: string;
          classNumber: number;
          isActive?: boolean;
          limitations?: string;
        }>;
        projectId?: Id<"projects">;
        replaceAll?: boolean;
      },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      {
        companyId?: Id<"companies">;
        projectId?: Id<"projects">;
        ratingId: Id<"entityClassRatings">;
      },
      any
    >;
    upsert: FunctionReference<
      "mutation",
      "public",
      {
        authority?: "faa" | "easa" | "other";
        category: string;
        classNumber: number;
        companyId?: Id<"companies">;
        isActive?: boolean;
        limitations?: string;
        projectId?: Id<"projects">;
      },
      any
    >;
  };
  entityIssues: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        assessmentId?: string;
        description: string;
        externalId?: string;
        location?: string;
        projectId: Id<"projects">;
        regulationRef?: string;
        severity: "critical" | "major" | "minor" | "observation";
        source:
          | "audit_sim"
          | "paperwork_review"
          | "analysis"
          | "manual"
          | "logbook_compliance";
        sourceId?: string;
        title: string;
      },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { assessmentId?: string; projectId: Id<"projects"> },
      any
    >;
    listByStatus: FunctionReference<
      "query",
      "public",
      {
        projectId: Id<"projects">;
        status:
          | "open"
          | "in_progress"
          | "pending_verification"
          | "closed"
          | "voided";
      },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { issueId: Id<"entityIssues"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        aiRootCauseAnalysis?: string;
        closedAt?: string;
        correctiveAction?: string;
        description?: string;
        dueDate?: string;
        evidenceOfClosure?: string;
        externalId?: string;
        issueId: Id<"entityIssues">;
        location?: string;
        owner?: string;
        preventiveAction?: string;
        regulationRef?: string;
        rootCause?: string;
        rootCauseCategory?:
          | "training"
          | "procedure"
          | "equipment"
          | "human_error"
          | "process"
          | "material"
          | "management";
        severity?: "critical" | "major" | "minor" | "observation";
        status?:
          | "open"
          | "in_progress"
          | "pending_verification"
          | "closed"
          | "voided";
        title?: string;
        verifiedBy?: string;
      },
      any
    >;
  };
  entityLimitedRatings: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        articleDescription: string;
        authority?: "faa" | "easa" | "other";
        authorizedFunctions: Array<string>;
        companyId?: Id<"companies">;
        easaCategory?: string;
        easaRating?: string;
        isActive?: boolean;
        limitations?: string;
        make?: string;
        model?: string;
        partNumber?: string;
        projectId?: Id<"projects">;
        ratingKind: string;
      },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      {
        companyId?: Id<"companies">;
        projectId?: Id<"projects">;
        ratingId: Id<"entityLimitedRatings">;
      },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        articleDescription?: string;
        authority?: "faa" | "easa" | "other";
        authorizedFunctions?: Array<string>;
        companyId?: Id<"companies">;
        easaCategory?: string;
        easaRating?: string;
        isActive?: boolean;
        limitations?: string;
        make?: string;
        model?: string;
        partNumber?: string;
        projectId?: Id<"projects">;
        ratingId: Id<"entityLimitedRatings">;
        ratingKind?: string;
      },
      any
    >;
  };
  entityOpSpecs: {
    addOrUpdate: FunctionReference<
      "mutation",
      "public",
      {
        acceptedDate?: string;
        authority?: "faa" | "easa" | "other";
        certPart?:
          | "145"
          | "121"
          | "125"
          | "129"
          | "133"
          | "135"
          | "137"
          | "141"
          | "142"
          | "147"
          | "91K"
          | "91LOA";
        companyId?: Id<"companies">;
        docType?: "opspec" | "mspec" | "tspec" | "loa";
        expiryDate?: string;
        isActive: boolean;
        notes?: string;
        paragraph: string;
        projectId?: Id<"projects">;
        title?: string;
      },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      {
        companyId?: Id<"companies">;
        opSpecId: Id<"entityOpSpecs">;
        projectId?: Id<"projects">;
      },
      any
    >;
  };
  entityProfiles: {
    backfillCompanyProfilesFromProjectProfiles: FunctionReference<
      "mutation",
      "public",
      {},
      any
    >;
    getByCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    getByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    importFromAssessment: FunctionReference<
      "mutation",
      "public",
      { assessmentId: Id<"assessments">; projectId: Id<"projects"> },
      any
    >;
    upsert: FunctionReference<
      "mutation",
      "public",
      {
        aircraftCategories?: Array<string>;
        certifications?: Array<string>;
        companyName?: string;
        contactEmail?: string;
        contactName?: string;
        contactPhone?: string;
        dfarsCompliant?: boolean;
        easaApprovalRef?: string;
        easaCompetentAuthority?: string;
        easaForm4PostHolders?: Array<{
          email?: string;
          name: string;
          roleId: string;
        }>;
        easaLineMaintenanceBases?: Array<string>;
        easaPart145Expiry?: string;
        easaPart147Ref?: string;
        easaPart21Ref?: string;
        easaPartCamoRef?: string;
        easaPartCaoRef?: string;
        employeeCount?: number;
        faaCertTypesHeld?: Array<
          | "145"
          | "121"
          | "125"
          | "129"
          | "133"
          | "135"
          | "137"
          | "141"
          | "142"
          | "147"
          | "91K"
          | "91LOA"
        >;
        faaCertificateDate?: string;
        faaCertificateNumber?: string;
        faaChdo?: string;
        faaLastAmendmentDate?: string;
        faaPart121Certificate?: string;
        faaPart125Certificate?: string;
        faaPart129Certificate?: string;
        faaPart133Certificate?: string;
        faaPart135Certificate?: string;
        faaPart137Certificate?: string;
        faaPart141Certificate?: string;
        faaPart142Certificate?: string;
        faaPart147Certificate?: string;
        faaPart91KCertificate?: string;
        faaPeerGroup?: "F" | "G" | "H";
        facilitySquareFootage?: number;
        hasSms?: boolean;
        icaoStateOfRegistry?: string;
        isbaoLevel?: string;
        itarRegistered?: boolean;
        legalEntityName?: string;
        operationsScope?: string;
        part65Authorizations?: Array<string>;
        primaryLocation?: string;
        projectId: Id<"projects">;
        qualityStandards?: Array<string>;
        repairStationType?: string;
        servicesOffered?: Array<string>;
        smsMaturity?: string;
      },
      any
    >;
    upsertByCompany: FunctionReference<
      "mutation",
      "public",
      {
        aircraftCategories?: Array<string>;
        certifications?: Array<string>;
        companyId: Id<"companies">;
        companyName?: string;
        contactEmail?: string;
        contactName?: string;
        contactPhone?: string;
        dfarsCompliant?: boolean;
        easaApprovalRef?: string;
        easaCompetentAuthority?: string;
        easaForm4PostHolders?: Array<{
          email?: string;
          name: string;
          roleId: string;
        }>;
        easaLineMaintenanceBases?: Array<string>;
        easaPart145Expiry?: string;
        easaPart147Ref?: string;
        easaPart21Ref?: string;
        easaPartCamoRef?: string;
        easaPartCaoRef?: string;
        employeeCount?: number;
        faaCertTypesHeld?: Array<
          | "145"
          | "121"
          | "125"
          | "129"
          | "133"
          | "135"
          | "137"
          | "141"
          | "142"
          | "147"
          | "91K"
          | "91LOA"
        >;
        faaCertificateDate?: string;
        faaCertificateNumber?: string;
        faaChdo?: string;
        faaLastAmendmentDate?: string;
        faaPart121Certificate?: string;
        faaPart125Certificate?: string;
        faaPart129Certificate?: string;
        faaPart133Certificate?: string;
        faaPart135Certificate?: string;
        faaPart137Certificate?: string;
        faaPart141Certificate?: string;
        faaPart142Certificate?: string;
        faaPart147Certificate?: string;
        faaPart91KCertificate?: string;
        faaPeerGroup?: "F" | "G" | "H";
        facilitySquareFootage?: number;
        hasSms?: boolean;
        icaoStateOfRegistry?: string;
        isbaoLevel?: string;
        itarRegistered?: boolean;
        legalEntityName?: string;
        operationsScope?: string;
        part65Authorizations?: Array<string>;
        primaryLocation?: string;
        qualityStandards?: Array<string>;
        repairStationType?: string;
        servicesOffered?: Array<string>;
        smsMaturity?: string;
      },
      any
    >;
  };
  fileActions: {
    generateUploadUrl: FunctionReference<"mutation", "public", {}, any>;
    getFileUrl: FunctionReference<
      "query",
      "public",
      { storageId: Id<"_storage"> },
      any
    >;
    getProjectDocumentFileUrl: FunctionReference<
      "query",
      "public",
      { documentId: Id<"documents"> },
      any
    >;
    getSharedAgentDocumentFileUrl: FunctionReference<
      "query",
      "public",
      { documentId: Id<"sharedAgentDocuments"> },
      any
    >;
    getSharedReferenceDocumentFileUrl: FunctionReference<
      "query",
      "public",
      { documentId: Id<"sharedReferenceDocuments"> },
      any
    >;
    getSharedReferenceDocumentFileUrlsBatch: FunctionReference<
      "query",
      "public",
      { documentIds: Array<Id<"sharedReferenceDocuments">> },
      any
    >;
  };
  form337Records: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId?: Id<"aircraftAssets">;
        fieldMappedOutput?: any;
        formData: any;
        narrativeDraftOutput?: string;
        projectId: Id<"projects">;
        status?: "draft" | "ready_for_review";
        title: string;
      },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { recordId: Id<"form337Records"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId?: Id<"aircraftAssets">;
        fieldMappedOutput?: any;
        formData?: any;
        narrativeDraftOutput?: string;
        recordId: Id<"form337Records">;
        status?: "draft" | "ready_for_review";
        title?: string;
      },
      any
    >;
  };
  inspectionSchedule: {
    addItems: FunctionReference<
      "mutation",
      "public",
      {
        items: Array<{
          ataChapter?: string | null;
          category?: string | null;
          certificateProfileId?: Id<"certificateProfiles">;
          description?: string | null;
          documentExcerpt?: string | null;
          intervalDays?: number | null;
          intervalMonths?: number | null;
          intervalType: string;
          intervalValue?: number | null;
          isRegulatory?: boolean | null;
          lastPerformedAt?: string | null;
          lastPerformedSource?: string | null;
          obligationRuleId?: string;
          regulationRef?: string | null;
          sourceDocumentId?: Id<"documents"> | string;
          sourceDocumentName?: string | null;
          sourceRevisionId?: string | null;
          sourceSectionIdOrRef?: string | null;
          title: string;
        }>;
        projectId: Id<"projects">;
      },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    normalizeProjectItems: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    removeItem: FunctionReference<
      "mutation",
      "public",
      { itemId: Id<"inspectionScheduleItems"> },
      any
    >;
    removeItems: FunctionReference<
      "mutation",
      "public",
      { itemIds: Array<Id<"inspectionScheduleItems">> },
      any
    >;
    updateItem: FunctionReference<
      "mutation",
      "public",
      {
        ataChapter?: string;
        category?: string;
        certificateProfileId?: Id<"certificateProfiles">;
        description?: string;
        documentExcerpt?: string;
        intervalDays?: number;
        intervalMonths?: number;
        intervalType?: string;
        intervalValue?: number;
        isRegulatory?: boolean;
        itemId: Id<"inspectionScheduleItems">;
        lastPerformedAt?: string;
        lastPerformedSource?: string;
        obligationRuleId?: string;
        regulationRef?: string;
        sourceRevisionId?: string;
        sourceSectionIdOrRef?: string;
        title?: string;
      },
      any
    >;
    updateLastPerformed: FunctionReference<
      "mutation",
      "public",
      { itemId: Id<"inspectionScheduleItems">; lastPerformedAt: string },
      any
    >;
  };
  logbookDraftEntries: {
    addBatch: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        entries: Array<{
          adReferences?: Array<string>;
          adSbReferences?: Array<string>;
          ataChapter?: string;
          bookVolume?: string;
          confidence?: number;
          entryDate?: string;
          entryType?: string;
          fieldConfidence?: any;
          hasReturnToService?: boolean;
          rawText: string;
          returnToServiceStatement?: string;
          sbReferences?: Array<string>;
          signerCertNumber?: string;
          signerCertType?: string;
          signerName?: string;
          sourcePage?: number;
          totalCyclesAtEntry?: number;
          totalLandingsAtEntry?: number;
          totalTimeAtEntry?: number;
          userVerified?: boolean;
          workPerformed?: string;
        }>;
        projectId: Id<"projects">;
        sourceDocumentId: Id<"documents">;
      },
      any
    >;
    importSelected: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        draftIds: Array<Id<"logbookDraftEntries">>;
        projectId: Id<"projects">;
      },
      any
    >;
    listByAircraft: FunctionReference<
      "query",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        projectId: Id<"projects">;
        sourceDocumentId?: Id<"documents">;
      },
      any
    >;
    removeBySourceDocument: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        projectId: Id<"projects">;
        sourceDocumentId: Id<"documents">;
      },
      any
    >;
    removeSelected: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        draftIds: Array<Id<"logbookDraftEntries">>;
        projectId: Id<"projects">;
      },
      any
    >;
  };
  logbookEntries: {
    addBatch: FunctionReference<
      "mutation",
      "public",
      {
        entries: Array<{
          adReferences?: Array<string>;
          adSbReferences?: Array<string>;
          aircraftId: Id<"aircraftAssets">;
          ataChapter?: string;
          bookVolume?: string;
          confidence?: number;
          entryDate?: string;
          entryType?: string;
          fieldConfidence?: any;
          hasReturnToService?: boolean;
          rawText: string;
          returnToServiceStatement?: string;
          sbReferences?: Array<string>;
          signerCertNumber?: string;
          signerCertType?: string;
          signerName?: string;
          sourceDocumentId?: Id<"documents">;
          sourcePage?: number;
          totalCyclesAtEntry?: number;
          totalLandingsAtEntry?: number;
          totalTimeAtEntry?: number;
          userVerified?: boolean;
          workPerformed?: string;
        }>;
        projectId: Id<"projects">;
      },
      any
    >;
    checkContinuity: FunctionReference<
      "query",
      "public",
      { aircraftId: Id<"aircraftAssets">; projectId: Id<"projects"> },
      any
    >;
    detectGaps: FunctionReference<
      "query",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        projectId: Id<"projects">;
        thresholdDays?: number;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { entryId: Id<"logbookEntries"> },
      any
    >;
    listByAircraft: FunctionReference<
      "query",
      "public",
      { aircraftId: Id<"aircraftAssets">; projectId: Id<"projects"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { entryId: Id<"logbookEntries"> },
      any
    >;
    search: FunctionReference<
      "query",
      "public",
      {
        aircraftId?: Id<"aircraftAssets">;
        bookVolume?: string;
        dateFrom?: string;
        dateTo?: string;
        entryType?: string;
        projectId: Id<"projects">;
        searchText?: string;
      },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        adReferences?: Array<string>;
        adSbReferences?: Array<string>;
        ataChapter?: string;
        bookVolume?: string;
        entryDate?: string;
        entryId: Id<"logbookEntries">;
        entryType?: string;
        hasReturnToService?: boolean;
        returnToServiceStatement?: string;
        sbReferences?: Array<string>;
        signerCertNumber?: string;
        signerCertType?: string;
        signerName?: string;
        totalCyclesAtEntry?: number;
        totalLandingsAtEntry?: number;
        totalTimeAtEntry?: number;
        userVerified?: boolean;
        workPerformed?: string;
      },
      any
    >;
  };
  manualChangeLogs: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        changeType: string;
        description: string;
        manualId: Id<"manuals">;
        revisionId: Id<"manualRevisions">;
        section: string;
      },
      any
    >;
    listByRevision: FunctionReference<
      "query",
      "public",
      { revisionId: Id<"manualRevisions"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { logId: Id<"manualChangeLogs"> },
      any
    >;
  };
  manualGroups: {
    assignPublications: FunctionReference<
      "mutation",
      "public",
      {
        groupId: Id<"manualGroups"> | null;
        publicationIds: Array<Id<"technicalPublications">>;
      },
      any
    >;
    create: FunctionReference<
      "mutation",
      "public",
      {
        companyId: Id<"companies">;
        makeModel?: string;
        manufacturer?: string;
        name: string;
        notes?: string;
        publicationType?:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
        revisionNumber?: string;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { groupId: Id<"manualGroups"> },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      {
        companyId: Id<"companies">;
        publicationType?:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
      },
      any
    >;
    listByCompanyWithCounts: FunctionReference<
      "query",
      "public",
      {
        companyId: Id<"companies">;
        publicationType?:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
      },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { groupId: Id<"manualGroups"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        groupId: Id<"manualGroups">;
        makeModel?: string;
        manufacturer?: string;
        name?: string;
        notes?: string;
        publicationType?:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
        revisionNumber?: string;
      },
      any
    >;
  };
  manuals: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        citationsEnabled?: boolean;
        customerUserId?: string;
        formatConfig?: { font: string; margins: string };
        manualType: string;
        projectId: Id<"projects">;
        title: string;
        writingStyle?: string;
      },
      any
    >;
    createRevision: FunctionReference<
      "mutation",
      "public",
      {
        manualId: Id<"manuals">;
        notes?: string;
        revisionNumber: string;
        revisionTitle?: string;
        sourceDocumentId?: Id<"documents">;
      },
      any
    >;
    listAllForEmployee: FunctionReference<"query", "public", {}, any>;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listForCurrentUser: FunctionReference<"query", "public", {}, any>;
    listRevisionLinksByManual: FunctionReference<
      "query",
      "public",
      { manualId: Id<"manuals"> },
      any
    >;
    listRevisionLinksByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listRevisions: FunctionReference<
      "query",
      "public",
      { manualId: Id<"manuals"> },
      any
    >;
    listUsersWithManualStats: FunctionReference<"query", "public", {}, any>;
    remove: FunctionReference<
      "mutation",
      "public",
      { manualId: Id<"manuals"> },
      any
    >;
    removeRevision: FunctionReference<
      "mutation",
      "public",
      { revisionId: Id<"manualRevisions"> },
      any
    >;
    resolveRevision: FunctionReference<
      "mutation",
      "public",
      {
        manualId: Id<"manuals">;
        notes?: string;
        resolution: "customer_approved" | "customer_rejected";
        revisionId: Id<"manualRevisions">;
      },
      any
    >;
    submitRevision: FunctionReference<
      "mutation",
      "public",
      { manualId: Id<"manuals">; revisionId: Id<"manualRevisions"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        appendixNotes?: string;
        citationsEnabled?: boolean;
        currentRevision?: string;
        customerUserId?: string;
        definitions?: Array<{ definition: string; term: string }>;
        formatConfig?: { font: string; margins: string };
        manualId: Id<"manuals">;
        status?: string;
        title?: string;
        writingStyle?: string;
      },
      any
    >;
    updateRevision: FunctionReference<
      "mutation",
      "public",
      {
        notes?: string;
        revisionId: Id<"manualRevisions">;
        revisionNumber?: string;
        revisionTitle?: string;
        sourceDocumentId?: Id<"documents"> | null;
        status?: string;
      },
      any
    >;
    upsertRevisionLinks: FunctionReference<
      "mutation",
      "public",
      {
        projectId: Id<"projects">;
        scannedRevisions: Array<{
          detectedRevision: string;
          documentName: string;
          documentRevisionId?: Id<"documentRevisions">;
          sourceDocumentId?: Id<"documents">;
          sourceDocumentIdString?: string;
        }>;
      },
      any
    >;
  };
  manualSections: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        activeStandards?: Array<string>;
        cfrRefs?: Array<string>;
        citationsOverride?: boolean | null;
        generatedContent: string;
        manualType: string;
        projectId: Id<"projects">;
        sectionNumber?: string;
        sectionTitle: string;
        sourceDocumentId?: Id<"documents">;
        status?: string;
        toneOverride?: string;
      },
      any
    >;
    listApprovedByProject: FunctionReference<
      "query",
      "public",
      { manualType: string; projectId: Id<"projects"> },
      any
    >;
    listApprovedByTypeAndSection: FunctionReference<
      "query",
      "public",
      { limit?: number; manualType: string; sectionNumber?: string },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listByProjectAndType: FunctionReference<
      "query",
      "public",
      { manualType: string; projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { sectionId: Id<"manualSections"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        activeStandards?: Array<string>;
        cfrRefs?: Array<string>;
        citationsOverride?: boolean | null;
        generatedContent?: string;
        sectionId: Id<"manualSections">;
        sectionNumber?: string;
        sectionTitle?: string;
        status?: string;
        toneOverride?: string;
      },
      any
    >;
  };
  migrations: {
    backfillCertificateProfilesFromEntityProfiles: FunctionReference<
      "mutation",
      "public",
      {},
      any
    >;
    backfillCompaniesForProjects: FunctionReference<
      "mutation",
      "public",
      {},
      any
    >;
    repairOrphanedEntityProfileChildren: FunctionReference<
      "mutation",
      "public",
      {},
      any
    >;
  };
  productEvents: {
    logProductEvent: FunctionReference<
      "mutation",
      "public",
      {
        anonymousId?: string;
        eventType: string;
        projectId?: Id<"projects">;
        properties?: string;
      },
      any
    >;
  };
  projectAgentDocuments: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        agentId: string;
        extractedAt: string;
        extractedText?: string;
        mimeType?: string;
        name: string;
        path: string;
        projectId: Id<"projects">;
        region?: string;
        source: string;
        storageId?: Id<"_storage">;
      },
      any
    >;
    clear: FunctionReference<
      "mutation",
      "public",
      { agentId: string; projectId: Id<"projects"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listByProjectAndAgent: FunctionReference<
      "query",
      "public",
      { agentId: string; projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"projectAgentDocuments"> },
      any
    >;
    updateRegion: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"projectAgentDocuments">; region: string },
      any
    >;
  };
  projects: {
    create: FunctionReference<
      "mutation",
      "public",
      { companyId?: Id<"companies">; description?: string; name: string },
      any
    >;
    exportBundle: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    list: FunctionReference<"query", "public", {}, any>;
    listForCompanyManagement: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { confirmName: string; projectId: Id<"projects"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      { description?: string; name?: string; projectId: Id<"projects"> },
      any
    >;
  };
  publicationSections: {
    bulkInsert: FunctionReference<
      "mutation",
      "public",
      {
        publicationId: Id<"technicalPublications">;
        sections: Array<{
          ataChapter: string;
          ataSection?: string;
          chunkIds?: Array<Id<"documentChunks">>;
          depth: number;
          endPage: number;
          parentSectionId?: Id<"publicationSections">;
          startPage: number;
          title: string;
        }>;
      },
      any
    >;
    getByAta: FunctionReference<
      "query",
      "public",
      { ataChapter: string; publicationId: Id<"technicalPublications"> },
      any
    >;
    listByPublication: FunctionReference<
      "query",
      "public",
      { publicationId: Id<"technicalPublications"> },
      any
    >;
    replaceAll: FunctionReference<
      "mutation",
      "public",
      {
        publicationId: Id<"technicalPublications">;
        sections: Array<{
          ataChapter: string;
          ataSection?: string;
          chunkIds?: Array<Id<"documentChunks">>;
          depth: number;
          endPage: number;
          parentSectionId?: Id<"publicationSections">;
          startPage: number;
          title: string;
        }>;
      },
      any
    >;
  };
  qualityDashboard: {
    getCommandCenterSummary: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
  };
  roster: {
    addAssignment: FunctionReference<
      "mutation",
      "public",
      {
        assignedDate?: string;
        dueDate?: string;
        evidence?: Record<string, string>;
        evidenceLink?: string;
        graceDaysOverride?: number;
        lastCompletedDate?: string;
        notes?: string;
        personId: Id<"rosterPersonnel">;
        projectId: Id<"projects">;
        recurrenceDaysOverride?: number;
        recurrenceIntervalUnitOverride?: "days" | "months" | "years";
        recurrenceIntervalValueOverride?: number;
        requirementTypeId: Id<"rosterRequirementTypes">;
      },
      any
    >;
    addPerson: FunctionReference<
      "mutation",
      "public",
      {
        capabilities?: Array<string>;
        certificateNumber?: string;
        employeeId?: string;
        fullName: string;
        isActive?: boolean;
        jobDescription?: string;
        projectId: Id<"projects">;
        roleTitle?: string;
      },
      any
    >;
    addRequirementType: FunctionReference<
      "mutation",
      "public",
      {
        category?: string;
        defaultCalendarMonths?: number;
        defaultGraceDays?: number;
        defaultIntervalUnit?: "days" | "months" | "years";
        defaultIntervalValue?: number;
        defaultRecurrenceDays?: number;
        description?: string;
        dueDateStrategy?:
          | "fixed_days"
          | "fixed_interval"
          | "calendar_month_end"
          | "ia_march_odd_year";
        isActive?: boolean;
        name: string;
        projectId: Id<"projects">;
        promptSchema?: Array<{
          fieldType: "date" | "text" | "textarea" | "number" | "select";
          id: string;
          label: string;
          options?: Array<string>;
          placeholder?: string;
          required?: boolean;
        }>;
      },
      any
    >;
    getDashboard: FunctionReference<
      "query",
      "public",
      { capability?: string; projectId: Id<"projects"> },
      any
    >;
    listAssignments: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listPersonnel: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    listRequirementTypes: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    migrateRosterQualificationRulesForProject: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    removeAssignment: FunctionReference<
      "mutation",
      "public",
      { assignmentId: Id<"rosterAssignments"> },
      any
    >;
    removePerson: FunctionReference<
      "mutation",
      "public",
      { adminPosition: string; personId: Id<"rosterPersonnel"> },
      any
    >;
    removeRequirementType: FunctionReference<
      "mutation",
      "public",
      { requirementTypeId: Id<"rosterRequirementTypes"> },
      any
    >;
    updateAssignment: FunctionReference<
      "mutation",
      "public",
      {
        assignedDate?: string;
        assignmentId: Id<"rosterAssignments">;
        clearRecurrenceOverrides?: boolean;
        dueDate?: string;
        evidence?: Record<string, string>;
        evidenceLink?: string;
        graceDaysOverride?: number;
        lastCompletedDate?: string;
        notes?: string;
        recurrenceDaysOverride?: number;
        recurrenceIntervalUnitOverride?: "days" | "months" | "years";
        recurrenceIntervalValueOverride?: number;
      },
      any
    >;
    updatePerson: FunctionReference<
      "mutation",
      "public",
      {
        capabilities?: Array<string>;
        certificateNumber?: string;
        employeeId?: string;
        fullName?: string;
        isActive?: boolean;
        jobDescription?: string;
        personId: Id<"rosterPersonnel">;
        roleTitle?: string;
      },
      any
    >;
    updateRequirementType: FunctionReference<
      "mutation",
      "public",
      {
        category?: string;
        defaultCalendarMonths?: number;
        defaultGraceDays?: number;
        defaultIntervalUnit?: "days" | "months" | "years";
        defaultIntervalValue?: number;
        defaultRecurrenceDays?: number;
        description?: string;
        dueDateStrategy?:
          | "fixed_days"
          | "fixed_interval"
          | "calendar_month_end"
          | "ia_march_odd_year";
        isActive?: boolean;
        name?: string;
        promptSchema?: Array<{
          fieldType: "date" | "text" | "textarea" | "number" | "select";
          id: string;
          label: string;
          options?: Array<string>;
          placeholder?: string;
          required?: boolean;
        }>;
        requirementTypeId: Id<"rosterRequirementTypes">;
      },
      any
    >;
  };
  sharedAgentDocuments: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        agentId: string;
        companyId?: Id<"companies">;
        extractedText?: string;
        mimeType?: string;
        name: string;
        path: string;
        region?: string;
        source: string;
        storageId?: Id<"_storage">;
      },
      any
    >;
    clearByAgent: FunctionReference<
      "mutation",
      "public",
      { agentId: string; companyId?: Id<"companies"> },
      any
    >;
    listAll: FunctionReference<"query", "public", {}, any>;
    listByAgent: FunctionReference<
      "query",
      "public",
      { agentId: string; companyId: Id<"companies"> },
      any
    >;
    listByAgents: FunctionReference<
      "query",
      "public",
      { agentIds: Array<string>; companyId: Id<"companies"> },
      any
    >;
    listForCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"sharedAgentDocuments"> },
      any
    >;
    updateRegion: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"sharedAgentDocuments">; region: string },
      any
    >;
  };
  sharedReferenceDocuments: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        canonicalDocType?: string;
        companyId?: Id<"companies">;
        contentHash?: string;
        documentType: string;
        effectiveDate?: string;
        extractedText?: string;
        issuer?: string;
        mimeType?: string;
        name: string;
        notes?: string;
        path: string;
        revision?: string;
        source: string;
        sourceUrl?: string;
        storageId?: Id<"_storage">;
      },
      any
    >;
    addDctXmlFromProject: FunctionReference<
      "mutation",
      "public",
      {
        contentHash?: string;
        mimeType?: string;
        name: string;
        notes?: string;
        parsed?: {
          assessmentTypeLabel?: string;
          contentHash: string;
          dctStatus?: string;
          dctVersionDate?: string;
          dctVersionNumber?: string;
          fileName: string;
          mlfId?: string;
          mlfLabel?: string;
          mlfName?: string;
          objective?: string;
          peerGroupLabel?: string;
          purpose?: string;
          questions: Array<{
            displayOrder?: number;
            noteToUser?: string;
            qVersionDate?: string;
            qVersionNumber?: string;
            questionDetailsId?: string;
            questionId: string;
            questionType?: string;
            references: Array<{ label: string; srcId?: string }>;
            responses: Array<string>;
            safetyAttribute?: string;
            scopingAttribute?: string;
            text: string;
          }>;
          specialtyLabel?: string;
          standardDctDetailId?: string;
          standardDctId?: string;
        };
        path: string;
        projectId: Id<"projects">;
        storageId: Id<"_storage">;
      },
      any
    >;
    clearByType: FunctionReference<
      "mutation",
      "public",
      { companyId?: Id<"companies">; documentType: string },
      any
    >;
    clearDctXmlFromProject: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    getActiveDctBulkDeleteJobForProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    getDctBulkDeleteJob: FunctionReference<
      "query",
      "public",
      { jobId: Id<"dctBulkDeleteJobs"> },
      any
    >;
    listAll: FunctionReference<"query", "public", {}, any>;
    listAllAdmin: FunctionReference<"query", "public", {}, any>;
    listByType: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies">; documentType: string },
      any
    >;
    listForCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"sharedReferenceDocuments"> },
      any
    >;
    startDctBulkDeleteJob: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects">; totalEstimate?: number },
      any
    >;
  };
  simulationResults: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        agentIds: Array<string>;
        assessmentId: string;
        assessmentName: string;
        createdAt: string;
        currentRound?: number;
        dataSummary?: any;
        discrepancies?: any;
        faaConfig?: any;
        isPaused?: boolean;
        isbaoStage?: number;
        messages: any;
        name: string;
        originalId: string;
        projectId: Id<"projects">;
        selfReviewMode: string;
        thinkingEnabled: boolean;
        totalRounds: number;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { simulationId: Id<"simulationResults"> },
      any
    >;
    listByProject: FunctionReference<
      "query",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { simulationId: Id<"simulationResults"> },
      any
    >;
    searchByProject: FunctionReference<
      "query",
      "public",
      { limit?: number; projectId: Id<"projects">; searchText?: string },
      any
    >;
  };
  technicalPublications: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        aircraftIds?: Array<Id<"aircraftAssets">>;
        companyId: Id<"companies">;
        documentId: Id<"documents">;
        effectiveDate?: string;
        makeModel?: string;
        manufacturer?: string;
        notes?: string;
        partNumber?: string;
        projectId: Id<"projects">;
        publicationType:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
        revisionDate?: string;
        revisionNumber?: string;
        title: string;
      },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { publicationId: Id<"technicalPublications"> },
      any
    >;
    linkAircraft: FunctionReference<
      "mutation",
      "public",
      {
        aircraftId: Id<"aircraftAssets">;
        publicationId: Id<"technicalPublications">;
        unlink?: boolean;
      },
      any
    >;
    listByAircraft: FunctionReference<
      "query",
      "public",
      { aircraftId: Id<"aircraftAssets">; projectId: Id<"projects"> },
      any
    >;
    listByCompany: FunctionReference<
      "query",
      "public",
      {
        companyId: Id<"companies">;
        publicationType?:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
      },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { publicationId: Id<"technicalPublications"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      {
        aircraftIds?: Array<Id<"aircraftAssets">>;
        effectiveDate?: string;
        makeModel?: string;
        manufacturer?: string;
        notes?: string;
        partNumber?: string;
        publicationId: Id<"technicalPublications">;
        publicationType?:
          | "maintenance_manual"
          | "parts_catalog"
          | "wiring_diagram"
          | "logbook_scan"
          | "other";
        revisionDate?: string;
        revisionNumber?: string;
        title?: string;
      },
      any
    >;
  };
  users: {
    getCurrent: FunctionReference<"query", "public", {}, any>;
    listAll: FunctionReference<"query", "public", {}, any>;
    listDirectoryForCompany: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies">; includePlatformStaff?: boolean },
      any
    >;
    listPlatformStaffForSupportPicker: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies"> },
      any
    >;
    lookupByEmailForCompanyAdmin: FunctionReference<
      "query",
      "public",
      { companyId: Id<"companies">; email: string },
      any
    >;
    setRole: FunctionReference<
      "mutation",
      "public",
      { role: string; targetUserId: Id<"users"> },
      any
    >;
    upsertFromClerk: FunctionReference<
      "mutation",
      "public",
      { clerkUserId: string; email: string; name?: string; picture?: string },
      any
    >;
  };
  userSettings: {
    get: FunctionReference<"query", "public", {}, any>;
    listAllForAdmin: FunctionReference<"query", "public", {}, any>;
    setLogbookEntitlement: FunctionReference<
      "mutation",
      "public",
      {
        logbookEnabled: boolean;
        logbookEntitlementMode?: "addon" | "standalone";
        targetUserId: Id<"users">;
      },
      any
    >;
    updateEnabledAgents: FunctionReference<
      "mutation",
      "public",
      { enabledAgents: Array<string> | null; targetUserId: Id<"users"> },
      any
    >;
    updateEnabledFeatures: FunctionReference<
      "mutation",
      "public",
      { enabledFeatures: Array<string> | null; targetUserId: Id<"users"> },
      any
    >;
    updateEnabledFrameworks: FunctionReference<
      "mutation",
      "public",
      { enabledFrameworks: Array<string> | null; targetUserId: Id<"users"> },
      any
    >;
    upsert: FunctionReference<
      "mutation",
      "public",
      {
        activeCompanyId?: Id<"companies"> | null;
        activeProjectId?: Id<"projects"> | null;
        adaptiveThinking?: boolean;
        adaptiveThinkingEffort?: string;
        auditSimModel?: string;
        avianisApiKey?: string;
        avianisAuthMethod?: string;
        avianisBaseUrl?: string;
        avianisClientId?: string;
        avianisClientSecret?: string;
        avianisPassword?: string;
        avianisTenantId?: string;
        avianisUsername?: string;
        claudeModel?: string;
        dctDocumentCheckAgentId?: string;
        dctDocumentCheckModel?: string;
        dctTraceabilityAgentId?: string;
        dctTraceabilityModel?: string;
        forceCompanyContextDefault?: boolean;
        googleApiKey?: string;
        googleClientId?: string;
        llmModel?: string;
        llmProvider?: string;
        paperworkReviewAgentId?: string;
        paperworkReviewModel?: string;
        selfReviewMaxIterations?: number;
        selfReviewMode?: string;
        thinkingBudget?: number;
        thinkingEnabled?: boolean;
      },
      any
    >;
  };
} = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: {
  auditIntelligenceActions: {
    synthesizePatternsInternal: FunctionReference<
      "action",
      "internal",
      {},
      any
    >;
  };
  avianisIntegration: {
    _getSettingsForUser: FunctionReference<
      "query",
      "internal",
      { userId: string },
      any
    >;
    _listAircraftForProject: FunctionReference<
      "query",
      "internal",
      { projectId: Id<"projects"> },
      any
    >;
    _listUsersConfiguredForSync: FunctionReference<
      "query",
      "internal",
      {},
      any
    >;
    _scheduledSyncTick: FunctionReference<"action", "internal", {}, any>;
    _setCachedToken: FunctionReference<
      "mutation",
      "internal",
      { expiresAt: number; token: string; userId: string },
      any
    >;
    _setSyncMetadata: FunctionReference<
      "mutation",
      "internal",
      { errorMessage?: string | null; syncedAt?: number; userId: string },
      any
    >;
    _softCloseDiscrepanciesNotInList: FunctionReference<
      "mutation",
      "internal",
      {
        aircraftId: Id<"aircraftAssets">;
        keepExternalIds: Array<string>;
        projectId: Id<"projects">;
      },
      any
    >;
    _upsertAircraft: FunctionReference<
      "mutation",
      "internal",
      {
        avianisAircraftId: string;
        currentAsOfDate?: string;
        currentTotalCycles?: number;
        currentTotalLandings?: number;
        currentTotalTime?: number;
        make?: string;
        model?: string;
        operator?: string;
        projectId: Id<"projects">;
        serial?: string;
        tailNumber: string;
        userId: string;
        year?: number;
      },
      any
    >;
    _upsertDiscrepancy: FunctionReference<
      "mutation",
      "internal",
      {
        aircraftId: Id<"aircraftAssets">;
        ataChapter?: string;
        avianisExternalId: string;
        category?: string;
        deferralCategory?: string;
        deferralExpiresAt?: string;
        description: string;
        discoveredAt?: string;
        discoveredAtTotalTime?: number;
        location?: string;
        melItem?: string;
        partNumbers?: Array<string>;
        projectId: Id<"projects">;
        raw?: any;
        status: string;
        userId: string;
      },
      any
    >;
  };
  billing: {
    internalApplyStripeSubscription: FunctionReference<
      "mutation",
      "internal",
      { stripeCustomerId: string; subscription: any },
      any
    >;
    internalAssertBillingOwner: FunctionReference<
      "query",
      "internal",
      { ownerId: string; ownerType: "user" | "company"; userId: string },
      any
    >;
    internalGetBillingEvent: FunctionReference<
      "query",
      "internal",
      { stripeEventId: string },
      any
    >;
    internalGetCustomerByOwner: FunctionReference<
      "query",
      "internal",
      { ownerId: string; ownerType: "user" | "company" },
      any
    >;
    internalGetCustomerByStripeId: FunctionReference<
      "query",
      "internal",
      { stripeCustomerId: string },
      any
    >;
    internalGetSubscriptionStripeId: FunctionReference<
      "query",
      "internal",
      { ownerId: string; ownerType: "user" | "company" },
      any
    >;
    internalListAllCustomers: FunctionReference<"query", "internal", {}, any>;
    internalRecordBillingEvent: FunctionReference<
      "mutation",
      "internal",
      {
        errorMessage?: string;
        eventType: string;
        ownerId?: string;
        ownerType?: "user" | "company";
        status: "processed" | "failed" | "skipped";
        stripeEventId: string;
      },
      any
    >;
    internalSyncEntitlementsForOwner: FunctionReference<
      "mutation",
      "internal",
      {
        ownerId: string;
        ownerType: "user" | "company";
        planId: "basic" | "pro" | "enterprise";
        status: string;
      },
      any
    >;
    internalUpsertCustomer: FunctionReference<
      "mutation",
      "internal",
      {
        email: string;
        ownerId: string;
        ownerType: "user" | "company";
        stripeCustomerId: string;
      },
      any
    >;
    internalUpsertInvoice: FunctionReference<
      "mutation",
      "internal",
      {
        amountDue: number;
        amountPaid: number;
        billingCustomerId: Id<"billingCustomers">;
        currency: string;
        hostedInvoiceUrl?: string;
        invoicePdf?: string;
        periodEnd?: number;
        periodStart?: number;
        status: string;
        stripeInvoiceId: string;
        stripeSubscriptionId?: string;
      },
      any
    >;
    internalUpsertSubscription: FunctionReference<
      "mutation",
      "internal",
      {
        billingCustomerId: Id<"billingCustomers">;
        cancelAtPeriodEnd: boolean;
        canceledAt?: number;
        currentPeriodEnd?: number;
        currentPeriodStart?: number;
        dunningStatus?: "none" | "past_due" | "unpaid" | "canceled";
        latestInvoiceId?: string;
        ownerId: string;
        ownerType: "user" | "company";
        planId: "basic" | "pro" | "enterprise";
        status: string;
        stripePriceId: string;
        stripeSubscriptionId: string;
        trialEnd?: number;
      },
      any
    >;
  };
  billingReconcile: {
    reconcileAllCustomers: FunctionReference<"action", "internal", {}, any>;
  };
  billingWebhooks: {
    processStripeWebhook: FunctionReference<
      "action",
      "internal",
      { body: string; signature: string },
      any
    >;
  };
  companies: {
    getFeaturePolicyInternal: FunctionReference<
      "query",
      "internal",
      { companyId: Id<"companies"> },
      any
    >;
  };
  dctCompliance: {
    _createTraceabilityRun: FunctionReference<
      "mutation",
      "internal",
      {
        agentId: string;
        model: string;
        projectId: Id<"projects">;
        runPayload: {
          applicabilityByComparisonId?: Array<{
            applicability: "applicable" | "unsure" | "not_applicable";
            comparisonId: string;
          }>;
          batchSize: number;
          comparisonIds: Array<Id<"dctComparisons">>;
          corpus: string;
          docIds: Array<Id<"documents">>;
          lowConfidenceByComparisonId?: Array<{
            comparisonId: string;
            value: boolean;
          }>;
          systemPrompt: string;
        };
        total: number;
        userId: string;
      },
      any
    >;
    _failStaleTraceabilityRunsForProject: FunctionReference<
      "mutation",
      "internal",
      { exceptRunId?: Id<"dctTraceabilityRuns">; projectId: Id<"projects"> },
      any
    >;
    _getTraceabilityRun: FunctionReference<
      "query",
      "internal",
      { runId: Id<"dctTraceabilityRuns"> },
      any
    >;
    _updateTraceabilityRun: FunctionReference<
      "mutation",
      "internal",
      {
        completedAt?: string;
        error?: string;
        lastBadResponse?: string;
        parseFailed?: number;
        persistFailed?: number;
        persisted?: number;
        processed?: number;
        runId: Id<"dctTraceabilityRuns">;
        status?: "queued" | "running" | "completed" | "failed" | "cancelled";
      },
      any
    >;
    reevaluateApplicabilityForProject: FunctionReference<
      "mutation",
      "internal",
      { projectId: Id<"projects"> },
      any
    >;
    weeklyScheduleTick: FunctionReference<"mutation", "internal", {}, any>;
  };
  dctTraceabilityRunner: {
    _loadComparisonsForTrace: FunctionReference<
      "query",
      "internal",
      { comparisonIds: Array<Id<"dctComparisons">> },
      any
    >;
    _loadDocumentsForTrace: FunctionReference<
      "query",
      "internal",
      { docIds: Array<Id<"documents">> },
      any
    >;
    processTraceabilityBatch: FunctionReference<
      "action",
      "internal",
      { runId: Id<"dctTraceabilityRuns"> },
      any
    >;
    resumeStalledTraceabilityRuns: FunctionReference<
      "mutation",
      "internal",
      {},
      any
    >;
  };
  discrepancyResearch: {
    _insertDraftFromResearch: FunctionReference<
      "mutation",
      "internal",
      {
        aircraftId: Id<"aircraftAssets">;
        ataChapter?: string;
        discrepancyId: Id<"aircraftDiscrepancies">;
        projectId: Id<"projects">;
        rawText: string;
        returnToServiceStatement?: string;
        totalCyclesAtEntry?: number;
        totalLandingsAtEntry?: number;
        totalTimeAtEntry?: number;
        userId: string;
        workPerformed: string;
      },
      any
    >;
    _saveDraftLink: FunctionReference<
      "mutation",
      "internal",
      {
        discrepancyId: Id<"aircraftDiscrepancies">;
        draftId: Id<"logbookDraftEntries">;
      },
      any
    >;
    _saveResearch: FunctionReference<
      "mutation",
      "internal",
      { discrepancyId: Id<"aircraftDiscrepancies">; research: any },
      any
    >;
  };
  documentChunks: {
    clearForDocument: FunctionReference<
      "mutation",
      "internal",
      { documentId: Id<"documents"> },
      any
    >;
    getChunksByIds: FunctionReference<
      "query",
      "internal",
      { chunkIds: Array<Id<"documentChunks">> },
      any
    >;
    getCompanyIdForProject: FunctionReference<
      "query",
      "internal",
      { projectId: Id<"projects"> },
      any
    >;
    getDocumentForIndex: FunctionReference<
      "query",
      "internal",
      { documentId: Id<"documents"> },
      any
    >;
    indexDocument: FunctionReference<
      "action",
      "internal",
      { documentId: Id<"documents"> },
      any
    >;
    insertChunk: FunctionReference<
      "mutation",
      "internal",
      {
        category: string;
        chunkIndex: number;
        companyId?: Id<"companies">;
        createdAt: string;
        docName: string;
        documentId: Id<"documents">;
        embedding: Array<number>;
        embeddingModel: string;
        embeddingProvider?: string;
        endChar: number;
        projectId: Id<"projects">;
        startChar: number;
        text: string;
        totalChunks: number;
      },
      any
    >;
    listChunksByCompany: FunctionReference<
      "query",
      "internal",
      { companyId: Id<"companies"> },
      any
    >;
    listChunksByDocumentIds: FunctionReference<
      "query",
      "internal",
      { documentIds: Array<Id<"documents">> },
      any
    >;
    listChunksByProject: FunctionReference<
      "query",
      "internal",
      { projectId: Id<"projects"> },
      any
    >;
    listIndexStatusByCompany: FunctionReference<
      "query",
      "internal",
      { companyId: Id<"companies"> },
      any
    >;
    listIndexStatusByProject: FunctionReference<
      "query",
      "internal",
      { projectId: Id<"projects"> },
      any
    >;
    listProjectIdsByCompany: FunctionReference<
      "query",
      "internal",
      { companyId: Id<"companies"> },
      any
    >;
    recordIndexAttempt: FunctionReference<
      "mutation",
      "internal",
      {
        documentId: Id<"documents">;
        errorCode?: string;
        lastChunkCount?: number;
        lastError?: string;
        projectId: Id<"projects">;
        succeeded: boolean;
      },
      any
    >;
    scanChunksPageByProject: FunctionReference<
      "query",
      "internal",
      { cursor: string | null; pageSize: number; projectId: Id<"projects"> },
      any
    >;
  };
  entityIssues: {
    getForWebhook: FunctionReference<
      "query",
      "internal",
      { issueId: Id<"entityIssues"> },
      any
    >;
    listAllInternal: FunctionReference<"query", "internal", {}, any>;
  };
  entityOpSpecs: {
    migrateCertParts: FunctionReference<"mutation", "internal", {}, any>;
  };
  integrations: {
    deliverCarWebhook: FunctionReference<
      "action",
      "internal",
      { eventType: string; issueId: Id<"entityIssues"> },
      any
    >;
  };
  projects: {
    getInternal: FunctionReference<
      "query",
      "internal",
      { projectId: Id<"projects"> },
      any
    >;
  };
  sharedAgentDocuments: {
    upsertGenerated: FunctionReference<
      "mutation",
      "internal",
      { agentId: string; content: string },
      any
    >;
  };
  sharedReferenceDocuments: {
    runDctBulkDeleteChunk: FunctionReference<
      "mutation",
      "internal",
      { jobId: Id<"dctBulkDeleteJobs"> },
      any
    >;
  };
  users: {
    upsertFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkUserId: string; email: string; name?: string; picture?: string },
      any
    >;
  };
} = anyApi as any;

export const components = componentsGeneric() as unknown as {};
