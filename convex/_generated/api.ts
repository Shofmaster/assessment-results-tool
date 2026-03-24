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
        notes?: string;
        owner?: string;
        severity?: "critical" | "major" | "minor" | "observation";
        status?: "not_started" | "in_progress" | "complete" | "blocked";
      },
      any
    >;
    updateRun: FunctionReference<
      "mutation",
      "public",
      {
        checklistRunId: Id<"auditChecklistRuns">;
        notes?: string;
        status?: "draft" | "active" | "completed" | "archived";
      },
      any
    >;
  };
  auditIntelligenceActions: {
    synthesizePatterns: FunctionReference<"action", "public", {}, any>;
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
    updateExtractedText: FunctionReference<
      "mutation",
      "public",
      {
        documentId: Id<"documents">;
        extractedAt: string;
        extractedText: string;
        extractionMeta?: { backend: string; confidence?: number };
        mimeType?: string;
        size?: number;
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
  entityProfiles: {
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
        employeeCount?: number;
        facilitySquareFootage?: number;
        hasSms?: boolean;
        legalEntityName?: string;
        operationsScope?: string;
        primaryLocation?: string;
        projectId: Id<"projects">;
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
          category?: string | null;
          description?: string | null;
          documentExcerpt?: string | null;
          intervalDays?: number | null;
          intervalMonths?: number | null;
          intervalType: string;
          intervalValue?: number | null;
          isRegulatory?: boolean | null;
          lastPerformedAt?: string | null;
          lastPerformedSource?: string | null;
          regulationRef?: string | null;
          sourceDocumentId?: Id<"documents"> | string;
          sourceDocumentName?: string | null;
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
        category?: string;
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
        regulationRef?: string;
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
      { manualId: Id<"manuals">; notes?: string; revisionNumber: string },
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
      { notes?: string; revisionId: Id<"manualRevisions">; status?: string },
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
  };
  projects: {
    create: FunctionReference<
      "mutation",
      "public",
      { description?: string; name: string },
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
    remove: FunctionReference<
      "mutation",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    update: FunctionReference<
      "mutation",
      "public",
      { description?: string; name?: string; projectId: Id<"projects"> },
      any
    >;
  };
  sharedAgentDocuments: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        agentId: string;
        extractedText?: string;
        mimeType?: string;
        name: string;
        path: string;
        source: string;
        storageId?: Id<"_storage">;
      },
      any
    >;
    clearByAgent: FunctionReference<
      "mutation",
      "public",
      { agentId: string },
      any
    >;
    listAll: FunctionReference<"query", "public", {}, any>;
    listByAgent: FunctionReference<"query", "public", { agentId: string }, any>;
    listByAgents: FunctionReference<
      "query",
      "public",
      { agentIds: Array<string> },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"sharedAgentDocuments"> },
      any
    >;
  };
  sharedReferenceDocuments: {
    add: FunctionReference<
      "mutation",
      "public",
      {
        canonicalDocType?: string;
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
    clearByType: FunctionReference<
      "mutation",
      "public",
      { documentType: string },
      any
    >;
    listAll: FunctionReference<"query", "public", {}, any>;
    listAllAdmin: FunctionReference<"query", "public", {}, any>;
    listByType: FunctionReference<
      "query",
      "public",
      { documentType: string },
      any
    >;
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"sharedReferenceDocuments"> },
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
  };
  users: {
    getCurrent: FunctionReference<"query", "public", {}, any>;
    listAll: FunctionReference<"query", "public", {}, any>;
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
    upsert: FunctionReference<
      "mutation",
      "public",
      {
        activeProjectId?: Id<"projects"> | null;
        auditSimModel?: string;
        claudeModel?: string;
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
  entityIssues: {
    listAllInternal: FunctionReference<"query", "internal", {}, any>;
  };
  sharedAgentDocuments: {
    upsertGenerated: FunctionReference<
      "mutation",
      "internal",
      { agentId: string; content: string },
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
