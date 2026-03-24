/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  aircraftAssets: {
    document: {
      baselineAsOfDate?: string;
      baselineTotalCycles?: number;
      baselineTotalLandings?: number;
      baselineTotalTime?: number;
      createdAt: string;
      make?: string;
      model?: string;
      notes?: string;
      operator?: string;
      projectId: Id<"projects">;
      serial?: string;
      status?: string;
      tailNumber: string;
      updatedAt: string;
      userId: string;
      year?: number;
      _id: Id<"aircraftAssets">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "baselineAsOfDate"
      | "baselineTotalCycles"
      | "baselineTotalLandings"
      | "baselineTotalTime"
      | "createdAt"
      | "make"
      | "model"
      | "notes"
      | "operator"
      | "projectId"
      | "serial"
      | "status"
      | "tailNumber"
      | "updatedAt"
      | "userId"
      | "year";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_tailNumber: ["tailNumber", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aircraftComponents: {
    document: {
      aircraftCyclesAtInstall?: number;
      aircraftId: Id<"aircraftAssets">;
      aircraftTimeAtInstall?: number;
      ataChapter?: string;
      createdAt: string;
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
      removeDate?: string;
      removeLogbookEntryId?: Id<"logbookEntries">;
      serialNumber?: string;
      status: string;
      tsnAtInstall?: number;
      tsoAtInstall?: number;
      updatedAt: string;
      userId: string;
      _id: Id<"aircraftComponents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftCyclesAtInstall"
      | "aircraftId"
      | "aircraftTimeAtInstall"
      | "ataChapter"
      | "createdAt"
      | "cyclesAtInstall"
      | "description"
      | "installDate"
      | "installLogbookEntryId"
      | "isLifeLimited"
      | "lifeLimit"
      | "lifeLimitUnit"
      | "partNumber"
      | "position"
      | "projectId"
      | "removeDate"
      | "removeLogbookEntryId"
      | "serialNumber"
      | "status"
      | "tsnAtInstall"
      | "tsoAtInstall"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_aircraftId: ["aircraftId", "_creationTime"];
      by_aircraftId_status: ["aircraftId", "status", "_creationTime"];
      by_serialNumber: ["serialNumber", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  analyses: {
    document: {
      analysisDate: string;
      assessmentId: string;
      combinedInsights?: any;
      companyName: string;
      compliance: any;
      documentAnalyses?: any;
      findings: any;
      projectId: Id<"projects">;
      recommendations: any;
      userId: string;
      _id: Id<"analyses">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "analysisDate"
      | "assessmentId"
      | "combinedInsights"
      | "companyName"
      | "compliance"
      | "documentAnalyses"
      | "findings"
      | "projectId"
      | "recommendations"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  assessments: {
    document: {
      data: any;
      importedAt: string;
      originalId: string;
      projectId: Id<"projects">;
      userId: string;
      _id: Id<"assessments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "data"
      | "importedAt"
      | "originalId"
      | "projectId"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  auditChecklistItems: {
    document: {
      checklistRunId: Id<"auditChecklistRuns">;
      completedAt?: string;
      createdAt: string;
      description?: string;
      dueDate?: string;
      evidenceHint?: string;
      framework: string;
      linkedIssueId?: Id<"entityIssues">;
      notes?: string;
      owner?: string;
      projectId: Id<"projects">;
      requirementRef?: string;
      section: string;
      severity: "critical" | "major" | "minor" | "observation";
      sourceDocumentId?: Id<"documents"> | Id<"sharedReferenceDocuments">;
      sourceDocumentName?: string;
      sourceType?: "template" | "document" | "custom" | "manual";
      status: "not_started" | "in_progress" | "complete" | "blocked";
      subtypeId?: string;
      title: string;
      updatedAt: string;
      userId: string;
      _id: Id<"auditChecklistItems">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "checklistRunId"
      | "completedAt"
      | "createdAt"
      | "description"
      | "dueDate"
      | "evidenceHint"
      | "framework"
      | "linkedIssueId"
      | "notes"
      | "owner"
      | "projectId"
      | "requirementRef"
      | "section"
      | "severity"
      | "sourceDocumentId"
      | "sourceDocumentName"
      | "sourceType"
      | "status"
      | "subtypeId"
      | "title"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_checklistRunId: ["checklistRunId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_framework: ["projectId", "framework", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  auditChecklistRuns: {
    document: {
      completedAt?: string;
      createdAt: string;
      framework: string;
      frameworkLabel: string;
      generatedFromTemplateVersion: string;
      name?: string;
      notes?: string;
      profileId?: Id<"entityProfiles">;
      projectId: Id<"projects">;
      status: string;
      subtypeId?: string;
      subtypeLabel?: string;
      updatedAt: string;
      userId: string;
      _id: Id<"auditChecklistRuns">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "createdAt"
      | "framework"
      | "frameworkLabel"
      | "generatedFromTemplateVersion"
      | "name"
      | "notes"
      | "profileId"
      | "projectId"
      | "status"
      | "subtypeId"
      | "subtypeLabel"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_framework: ["projectId", "framework", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  checklistCustomTemplates: {
    document: {
      createdAt: string;
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
      updatedAt: string;
      userId: string;
      _id: Id<"checklistCustomTemplates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "framework"
      | "items"
      | "projectId"
      | "subtypeId"
      | "subtypeLabel"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_project_framework_subtype: [
        "projectId",
        "framework",
        "subtypeId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  complianceFindings: {
    document: {
      aircraftId: Id<"aircraftAssets">;
      citation: string;
      convertedToIssueId?: Id<"entityIssues">;
      createdAt: string;
      description: string;
      evidenceSnippet?: string;
      findingType: string;
      logbookEntryId?: Id<"logbookEntries">;
      projectId: Id<"projects">;
      resolutionNote?: string;
      resolvedAt?: string;
      resolvedBy?: string;
      ruleId: string;
      severity: string;
      status: string;
      title: string;
      updatedAt: string;
      userId: string;
      _id: Id<"complianceFindings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftId"
      | "citation"
      | "convertedToIssueId"
      | "createdAt"
      | "description"
      | "evidenceSnippet"
      | "findingType"
      | "logbookEntryId"
      | "projectId"
      | "resolutionNote"
      | "resolvedAt"
      | "resolvedBy"
      | "ruleId"
      | "severity"
      | "status"
      | "title"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_aircraftId: ["aircraftId", "_creationTime"];
      by_aircraftId_status: ["aircraftId", "status", "_creationTime"];
      by_logbookEntryId: ["logbookEntryId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  complianceRules: {
    document: {
      cfrPart: string;
      cfrSection: string;
      checkType: string;
      citation: string;
      createdAt: string;
      description: string;
      effectiveDate?: string;
      regulatoryPack: string;
      requiredFields: Array<string>;
      ruleId: string;
      severity: string;
      supersededDate?: string;
      title: string;
      version: number;
      _id: Id<"complianceRules">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "cfrPart"
      | "cfrSection"
      | "checkType"
      | "citation"
      | "createdAt"
      | "description"
      | "effectiveDate"
      | "regulatoryPack"
      | "requiredFields"
      | "ruleId"
      | "severity"
      | "supersededDate"
      | "title"
      | "version";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_cfrSection: ["cfrSection", "_creationTime"];
      by_regulatoryPack: ["regulatoryPack", "_creationTime"];
      by_ruleId: ["ruleId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  documentReviews: {
    document: {
      auditorIds?: Array<string>;
      batchId?: string;
      completedAt?: string;
      createdAt: string;
      findings?: any;
      name?: string;
      notes?: string;
      projectId: Id<"projects">;
      referenceDocumentId?: Id<"documents">;
      referenceDocumentIds?: Array<Id<"documents">>;
      reviewScope?: string;
      sharedReferenceDocumentIds?: Array<Id<"sharedReferenceDocuments">>;
      status: string;
      underReviewDocumentId: Id<"documents">;
      updatedAt?: string;
      userId: string;
      verdict?: string;
      _id: Id<"documentReviews">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "auditorIds"
      | "batchId"
      | "completedAt"
      | "createdAt"
      | "findings"
      | "name"
      | "notes"
      | "projectId"
      | "referenceDocumentId"
      | "referenceDocumentIds"
      | "reviewScope"
      | "sharedReferenceDocumentIds"
      | "status"
      | "underReviewDocumentId"
      | "updatedAt"
      | "userId"
      | "verdict";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_underReview: [
        "projectId",
        "underReviewDocumentId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  documentRevisions: {
    document: {
      category?: string;
      detectedRevision: string;
      documentName: string;
      documentType: string;
      isCurrentRevision?: boolean;
      lastCheckedAt?: string;
      latestKnownRevision: string;
      originalId: string;
      projectId: Id<"projects">;
      searchSummary: string;
      sourceDocumentId: string;
      status: string;
      userId: string;
      _id: Id<"documentRevisions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "category"
      | "detectedRevision"
      | "documentName"
      | "documentType"
      | "isCurrentRevision"
      | "lastCheckedAt"
      | "latestKnownRevision"
      | "originalId"
      | "projectId"
      | "searchSummary"
      | "sourceDocumentId"
      | "status"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  documents: {
    document: {
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
      userId: string;
      _id: Id<"documents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "category"
      | "extractedAt"
      | "extractedText"
      | "extractionMeta"
      | "extractionMeta.backend"
      | "extractionMeta.confidence"
      | "mimeType"
      | "name"
      | "path"
      | "projectId"
      | "size"
      | "source"
      | "storageId"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_category: ["projectId", "category", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityIssues: {
    document: {
      aiRootCauseAnalysis?: string;
      assessmentId?: string;
      carNumber?: string;
      closedAt?: string;
      correctiveAction?: string;
      createdAt: string;
      description: string;
      dueDate?: string;
      evidenceOfClosure?: string;
      location?: string;
      owner?: string;
      preventiveAction?: string;
      projectId: Id<"projects">;
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
      severity: "critical" | "major" | "minor" | "observation";
      source:
        | "audit_sim"
        | "paperwork_review"
        | "analysis"
        | "manual"
        | "logbook_compliance";
      sourceId?: string;
      status?:
        | "open"
        | "in_progress"
        | "pending_verification"
        | "closed"
        | "voided";
      title: string;
      userId: string;
      verifiedBy?: string;
      _id: Id<"entityIssues">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aiRootCauseAnalysis"
      | "assessmentId"
      | "carNumber"
      | "closedAt"
      | "correctiveAction"
      | "createdAt"
      | "description"
      | "dueDate"
      | "evidenceOfClosure"
      | "location"
      | "owner"
      | "preventiveAction"
      | "projectId"
      | "regulationRef"
      | "rootCause"
      | "rootCauseCategory"
      | "severity"
      | "source"
      | "sourceId"
      | "status"
      | "title"
      | "userId"
      | "verifiedBy";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_assessment: ["projectId", "assessmentId", "_creationTime"];
      by_projectId_status: ["projectId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityProfiles: {
    document: {
      aircraftCategories?: Array<string>;
      certifications?: Array<string>;
      companyName?: string;
      contactEmail?: string;
      contactName?: string;
      contactPhone?: string;
      createdAt: string;
      employeeCount?: number;
      facilitySquareFootage?: number;
      hasSms?: boolean;
      importedFromAssessmentAt?: string;
      lastSyncedAt?: string;
      legalEntityName?: string;
      operationsScope?: string;
      primaryLocation?: string;
      projectId: Id<"projects">;
      repairStationType?: string;
      servicesOffered?: Array<string>;
      smsMaturity?: string;
      sourceAssessmentId?: Id<"assessments">;
      updatedAt: string;
      userId: string;
      _id: Id<"entityProfiles">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftCategories"
      | "certifications"
      | "companyName"
      | "contactEmail"
      | "contactName"
      | "contactPhone"
      | "createdAt"
      | "employeeCount"
      | "facilitySquareFootage"
      | "hasSms"
      | "importedFromAssessmentAt"
      | "lastSyncedAt"
      | "legalEntityName"
      | "operationsScope"
      | "primaryLocation"
      | "projectId"
      | "repairStationType"
      | "servicesOffered"
      | "smsMaturity"
      | "sourceAssessmentId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  form337Records: {
    document: {
      aircraftId?: Id<"aircraftAssets">;
      createdAt: string;
      fieldMappedOutput?: any;
      formData: any;
      narrativeDraftOutput?: string;
      projectId: Id<"projects">;
      status: "draft" | "ready_for_review";
      title: string;
      updatedAt: string;
      userId: string;
      _id: Id<"form337Records">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftId"
      | "createdAt"
      | "fieldMappedOutput"
      | "formData"
      | "narrativeDraftOutput"
      | "projectId"
      | "status"
      | "title"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_status: ["projectId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  inspectionScheduleItems: {
    document: {
      category?: string | null;
      createdAt: string;
      description?: string | null;
      documentExcerpt?: string | null;
      intervalDays?: number | null;
      intervalMonths?: number | null;
      intervalType: string;
      intervalValue?: number | null;
      isRegulatory?: boolean | null;
      lastPerformedAt?: string | null;
      lastPerformedSource?: string | null;
      projectId: Id<"projects">;
      regulationRef?: string | null;
      sourceDocumentId?: Id<"documents"> | string;
      sourceDocumentName?: string | null;
      title: string;
      updatedAt: string;
      userId: string;
      _id: Id<"inspectionScheduleItems">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "category"
      | "createdAt"
      | "description"
      | "documentExcerpt"
      | "intervalDays"
      | "intervalMonths"
      | "intervalType"
      | "intervalValue"
      | "isRegulatory"
      | "lastPerformedAt"
      | "lastPerformedSource"
      | "projectId"
      | "regulationRef"
      | "sourceDocumentId"
      | "sourceDocumentName"
      | "title"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  logbookDraftEntries: {
    document: {
      adComplianceDetails?: any;
      adReferences?: Array<string>;
      adSbReferences?: Array<string>;
      aircraftId: Id<"aircraftAssets">;
      ataChapter?: string;
      componentMentions?: any;
      confidence?: number;
      createdAt: string;
      entryDate?: string;
      entryType?: string;
      fieldConfidence?: any;
      hasReturnToService?: boolean;
      inspectionType?: string;
      nextDueDate?: string;
      projectId: Id<"projects">;
      rawText: string;
      recurrenceInterval?: number;
      recurrenceUnit?: string;
      regulatoryBasis?: string;
      returnToServiceStatement?: string;
      sbComplianceDetails?: any;
      sbReferences?: Array<string>;
      signerCertNumber?: string;
      signerCertType?: string;
      signerName?: string;
      sourceDocumentId: Id<"documents">;
      sourcePage?: number;
      totalCyclesAtEntry?: number;
      totalLandingsAtEntry?: number;
      totalTimeAtEntry?: number;
      updatedAt: string;
      userId: string;
      userVerified?: boolean;
      workPerformed?: string;
      _id: Id<"logbookDraftEntries">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "adComplianceDetails"
      | "adReferences"
      | "adSbReferences"
      | "aircraftId"
      | "ataChapter"
      | "componentMentions"
      | "confidence"
      | "createdAt"
      | "entryDate"
      | "entryType"
      | "fieldConfidence"
      | "hasReturnToService"
      | "inspectionType"
      | "nextDueDate"
      | "projectId"
      | "rawText"
      | "recurrenceInterval"
      | "recurrenceUnit"
      | "regulatoryBasis"
      | "returnToServiceStatement"
      | "sbComplianceDetails"
      | "sbReferences"
      | "signerCertNumber"
      | "signerCertType"
      | "signerName"
      | "sourceDocumentId"
      | "sourcePage"
      | "totalCyclesAtEntry"
      | "totalLandingsAtEntry"
      | "totalTimeAtEntry"
      | "updatedAt"
      | "userId"
      | "userVerified"
      | "workPerformed";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_aircraftId: ["aircraftId", "_creationTime"];
      by_aircraftId_sourceDocumentId: [
        "aircraftId",
        "sourceDocumentId",
        "_creationTime",
      ];
      by_projectId: ["projectId", "_creationTime"];
      by_sourceDocumentId: ["sourceDocumentId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  logbookEntries: {
    document: {
      adComplianceDetails?: any;
      adReferences?: Array<string>;
      adSbReferences?: Array<string>;
      aircraftId: Id<"aircraftAssets">;
      ataChapter?: string;
      componentMentions?: any;
      confidence?: number;
      createdAt: string;
      entryDate?: string;
      entryType?: string;
      fieldConfidence?: any;
      hasReturnToService?: boolean;
      inspectionType?: string;
      nextDueDate?: string;
      projectId: Id<"projects">;
      rawText: string;
      recurrenceInterval?: number;
      recurrenceUnit?: string;
      regulatoryBasis?: string;
      returnToServiceStatement?: string;
      sbComplianceDetails?: any;
      sbReferences?: Array<string>;
      signerCertNumber?: string;
      signerCertType?: string;
      signerName?: string;
      sourceDocumentId?: Id<"documents">;
      sourcePage?: number;
      totalCyclesAtEntry?: number;
      totalLandingsAtEntry?: number;
      totalTimeAtEntry?: number;
      updatedAt: string;
      userId: string;
      userVerified?: boolean;
      workPerformed?: string;
      _id: Id<"logbookEntries">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "adComplianceDetails"
      | "adReferences"
      | "adSbReferences"
      | "aircraftId"
      | "ataChapter"
      | "componentMentions"
      | "confidence"
      | "createdAt"
      | "entryDate"
      | "entryType"
      | "fieldConfidence"
      | "hasReturnToService"
      | "inspectionType"
      | "nextDueDate"
      | "projectId"
      | "rawText"
      | "recurrenceInterval"
      | "recurrenceUnit"
      | "regulatoryBasis"
      | "returnToServiceStatement"
      | "sbComplianceDetails"
      | "sbReferences"
      | "signerCertNumber"
      | "signerCertType"
      | "signerName"
      | "sourceDocumentId"
      | "sourcePage"
      | "totalCyclesAtEntry"
      | "totalLandingsAtEntry"
      | "totalTimeAtEntry"
      | "updatedAt"
      | "userId"
      | "userVerified"
      | "workPerformed";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_aircraftId: ["aircraftId", "_creationTime"];
      by_aircraftId_entryDate: ["aircraftId", "entryDate", "_creationTime"];
      by_aircraftId_entryType: ["aircraftId", "entryType", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_sourceDocumentId: ["sourceDocumentId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  manualChangeLogs: {
    document: {
      authorId: string;
      changeType: string;
      createdAt: string;
      description: string;
      manualId: Id<"manuals">;
      revisionId: Id<"manualRevisions">;
      section: string;
      _id: Id<"manualChangeLogs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authorId"
      | "changeType"
      | "createdAt"
      | "description"
      | "manualId"
      | "revisionId"
      | "section";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_manualId: ["manualId", "_creationTime"];
      by_revisionId: ["revisionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  manualRevisions: {
    document: {
      createdAt: string;
      manualId: Id<"manuals">;
      notes?: string;
      resolvedAt?: string;
      revisionNumber: string;
      status: string;
      submittedAt?: string;
      submittedBy?: string;
      updatedAt: string;
      _id: Id<"manualRevisions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "manualId"
      | "notes"
      | "resolvedAt"
      | "revisionNumber"
      | "status"
      | "submittedAt"
      | "submittedBy"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_manualId: ["manualId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  manuals: {
    document: {
      appendixNotes?: string;
      citationsEnabled?: boolean;
      createdAt: string;
      currentRevision: string;
      customerUserId?: string;
      definitions?: Array<{ definition: string; term: string }>;
      formatConfig?: { font: string; margins: string };
      manualType: string;
      projectId: Id<"projects">;
      status: string;
      title: string;
      updatedAt: string;
      userId: string;
      writingStyle?: string;
      _id: Id<"manuals">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "appendixNotes"
      | "citationsEnabled"
      | "createdAt"
      | "currentRevision"
      | "customerUserId"
      | "definitions"
      | "formatConfig"
      | "formatConfig.font"
      | "formatConfig.margins"
      | "manualType"
      | "projectId"
      | "status"
      | "title"
      | "updatedAt"
      | "userId"
      | "writingStyle";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_customerUserId: ["customerUserId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  manualSections: {
    document: {
      activeStandards?: Array<string>;
      cfrRefs?: Array<string>;
      citationsOverride?: boolean | null;
      createdAt: string;
      generatedContent: string;
      manualId?: Id<"manuals">;
      manualType: string;
      projectId: Id<"projects">;
      sectionNumber?: string;
      sectionTitle: string;
      sourceDocumentId?: Id<"documents">;
      status: string;
      toneOverride?: string;
      updatedAt: string;
      userId: string;
      _id: Id<"manualSections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeStandards"
      | "cfrRefs"
      | "citationsOverride"
      | "createdAt"
      | "generatedContent"
      | "manualId"
      | "manualType"
      | "projectId"
      | "sectionNumber"
      | "sectionTitle"
      | "sourceDocumentId"
      | "status"
      | "toneOverride"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_manualType_status: ["manualType", "status", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_manualType: ["projectId", "manualType", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  projectAgentDocuments: {
    document: {
      agentId: string;
      extractedAt: string;
      extractedText?: string;
      mimeType?: string;
      name: string;
      path: string;
      projectId: Id<"projects">;
      source: string;
      storageId?: Id<"_storage">;
      userId: string;
      _id: Id<"projectAgentDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "agentId"
      | "extractedAt"
      | "extractedText"
      | "mimeType"
      | "name"
      | "path"
      | "projectId"
      | "source"
      | "storageId"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId_agentId: ["projectId", "agentId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  projects: {
    document: {
      createdAt: string;
      description?: string;
      name: string;
      updatedAt: string;
      userId: string;
      _id: Id<"projects">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "description"
      | "name"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_userId: ["userId", "_creationTime"];
      by_userId_updatedAt: ["userId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sharedAgentDocuments: {
    document: {
      addedAt: string;
      addedBy: string;
      agentId: string;
      extractedText?: string;
      mimeType?: string;
      name: string;
      path: string;
      source: string;
      storageId?: Id<"_storage">;
      _id: Id<"sharedAgentDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "addedAt"
      | "addedBy"
      | "agentId"
      | "extractedText"
      | "mimeType"
      | "name"
      | "path"
      | "source"
      | "storageId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_agentId: ["agentId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sharedReferenceDocuments: {
    document: {
      addedAt: string;
      addedBy: string;
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
      _id: Id<"sharedReferenceDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "addedAt"
      | "addedBy"
      | "canonicalDocType"
      | "documentType"
      | "effectiveDate"
      | "extractedText"
      | "issuer"
      | "mimeType"
      | "name"
      | "notes"
      | "path"
      | "revision"
      | "source"
      | "sourceUrl"
      | "storageId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_documentType: ["documentType", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  simulationResults: {
    document: {
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
      userId: string;
      _id: Id<"simulationResults">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "agentIds"
      | "assessmentId"
      | "assessmentName"
      | "createdAt"
      | "currentRound"
      | "dataSummary"
      | "discrepancies"
      | "faaConfig"
      | "isbaoStage"
      | "isPaused"
      | "messages"
      | "name"
      | "originalId"
      | "projectId"
      | "selfReviewMode"
      | "thinkingEnabled"
      | "totalRounds"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      clerkUserId: string;
      createdAt: string;
      email: string;
      lastSignInAt: string;
      name?: string;
      picture?: string;
      role: string;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clerkUserId"
      | "createdAt"
      | "email"
      | "lastSignInAt"
      | "name"
      | "picture"
      | "role";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clerkUserId: ["clerkUserId", "_creationTime"];
      by_email: ["email", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  userSettings: {
    document: {
      activeProjectId?: Id<"projects">;
      auditSimModel?: string;
      claudeModel?: string;
      googleApiKey?: string;
      googleClientId?: string;
      llmModel?: string;
      llmProvider?: string;
      logbookEnabled?: boolean;
      logbookEntitlementMode?: "addon" | "standalone";
      paperworkReviewAgentId?: string;
      paperworkReviewModel?: string;
      selfReviewMaxIterations: number;
      selfReviewMode: string;
      thinkingBudget: number;
      thinkingEnabled: boolean;
      userId: string;
      _id: Id<"userSettings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeProjectId"
      | "auditSimModel"
      | "claudeModel"
      | "googleApiKey"
      | "googleClientId"
      | "llmModel"
      | "llmProvider"
      | "logbookEnabled"
      | "logbookEntitlementMode"
      | "paperworkReviewAgentId"
      | "paperworkReviewModel"
      | "selfReviewMaxIterations"
      | "selfReviewMode"
      | "thinkingBudget"
      | "thinkingEnabled"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
