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
      aircraftTypeId?: Id<"aircraftTypes">;
      avianisAircraftId?: string;
      baselineAsOfDate?: string;
      baselineTotalCycles?: number;
      baselineTotalLandings?: number;
      baselineTotalTime?: number;
      createdAt: string;
      currentAsOfDate?: string;
      currentTotalCycles?: number;
      currentTotalLandings?: number;
      currentTotalTime?: number;
      lastSyncedAt?: number;
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
      | "aircraftTypeId"
      | "avianisAircraftId"
      | "baselineAsOfDate"
      | "baselineTotalCycles"
      | "baselineTotalLandings"
      | "baselineTotalTime"
      | "createdAt"
      | "currentAsOfDate"
      | "currentTotalCycles"
      | "currentTotalLandings"
      | "currentTotalTime"
      | "lastSyncedAt"
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
      by_avianisAircraftId: ["avianisAircraftId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_aircraftTypeId: [
        "projectId",
        "aircraftTypeId",
        "_creationTime",
      ];
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
  aircraftDiscrepancies: {
    document: {
      aircraftId: Id<"aircraftAssets">;
      ataChapter?: string;
      avianisExternalId?: string;
      category?: string;
      createdAt: string;
      deferralCategory?: string;
      deferralExpiresAt?: string;
      description: string;
      discoveredAt?: string;
      discoveredAtTotalTime?: number;
      location?: string;
      logbookDraftEntryId?: Id<"logbookDraftEntries">;
      melItem?: string;
      partNumbers?: Array<string>;
      projectId: Id<"projects">;
      raw?: any;
      research?: any;
      researchedAt?: number;
      source: string;
      status: string;
      updatedAt: string;
      userId: string;
      _id: Id<"aircraftDiscrepancies">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftId"
      | "ataChapter"
      | "avianisExternalId"
      | "category"
      | "createdAt"
      | "deferralCategory"
      | "deferralExpiresAt"
      | "description"
      | "discoveredAt"
      | "discoveredAtTotalTime"
      | "location"
      | "logbookDraftEntryId"
      | "melItem"
      | "partNumbers"
      | "projectId"
      | "raw"
      | "research"
      | "researchedAt"
      | "source"
      | "status"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_aircraftId: ["aircraftId", "_creationTime"];
      by_avianisExternalId: ["avianisExternalId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_status: ["projectId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aircraftTypes: {
    document: {
      createdAt: string;
      manufacturer?: string;
      model?: string;
      name: string;
      notes?: string;
      projectId: Id<"projects">;
      sortOrder?: number;
      updatedAt: string;
      userId: string;
      variant?: string;
      _id: Id<"aircraftTypes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "manufacturer"
      | "model"
      | "name"
      | "notes"
      | "projectId"
      | "sortOrder"
      | "updatedAt"
      | "userId"
      | "variant";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
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
      intervalDays?: number;
      intervalMonths?: number;
      lastPerformedAt?: string;
      linkedIssueId?: Id<"entityIssues">;
      notes?: string;
      obligationRuleId?: string;
      owner?: string;
      projectId: Id<"projects">;
      requirementRef?: string;
      section: string;
      severity: "critical" | "major" | "minor" | "observation";
      signoffCertNumber?: string;
      signoffCertType?: string;
      signoffDate?: string;
      signoffName?: string;
      sourceDocumentId?: Id<"documents"> | Id<"sharedReferenceDocuments">;
      sourceDocumentName?: string;
      sourceRevisionId?: string;
      sourceSectionIdOrRef?: string;
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
      | "intervalDays"
      | "intervalMonths"
      | "lastPerformedAt"
      | "linkedIssueId"
      | "notes"
      | "obligationRuleId"
      | "owner"
      | "projectId"
      | "requirementRef"
      | "section"
      | "severity"
      | "signoffCertNumber"
      | "signoffCertType"
      | "signoffDate"
      | "signoffName"
      | "sourceDocumentId"
      | "sourceDocumentName"
      | "sourceRevisionId"
      | "sourceSectionIdOrRef"
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
      by_obligationRuleId: ["obligationRuleId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_framework: ["projectId", "framework", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  auditChecklistRuns: {
    document: {
      certificateProfileId?: Id<"certificateProfiles">;
      checklistOccurrenceId?: Id<"checklistOccurrences">;
      checklistPurpose?: "pre_audit" | "recurring_ops" | "event";
      checklistSeriesId?: Id<"checklistSeries">;
      completedAt?: string;
      createdAt: string;
      framework: string;
      frameworkLabel: string;
      generatedFromTemplateVersion: string;
      name?: string;
      nextCycleDue?: string;
      notes?: string;
      obligationSetVersion?: string;
      profileId?: Id<"entityProfiles">;
      projectId: Id<"projects">;
      runIntervalDays?: number;
      runIntervalMonths?: number;
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
      | "certificateProfileId"
      | "checklistOccurrenceId"
      | "checklistPurpose"
      | "checklistSeriesId"
      | "completedAt"
      | "createdAt"
      | "framework"
      | "frameworkLabel"
      | "generatedFromTemplateVersion"
      | "name"
      | "nextCycleDue"
      | "notes"
      | "obligationSetVersion"
      | "profileId"
      | "projectId"
      | "runIntervalDays"
      | "runIntervalMonths"
      | "status"
      | "subtypeId"
      | "subtypeLabel"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_certificateProfileId: ["certificateProfileId", "_creationTime"];
      by_checklistSeriesId: ["checklistSeriesId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_framework: ["projectId", "framework", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingCustomers: {
    document: {
      createdAt: string;
      email: string;
      ownerId: string;
      ownerType: "user" | "company";
      stripeCustomerId: string;
      updatedAt: string;
      _id: Id<"billingCustomers">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "email"
      | "ownerId"
      | "ownerType"
      | "stripeCustomerId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_owner: ["ownerType", "ownerId", "_creationTime"];
      by_stripeCustomerId: ["stripeCustomerId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingEvents: {
    document: {
      createdAt: string;
      errorMessage?: string;
      eventType: string;
      ownerId?: string;
      ownerType?: "user" | "company";
      processedAt?: string;
      status: "processed" | "failed" | "skipped";
      stripeEventId: string;
      _id: Id<"billingEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "errorMessage"
      | "eventType"
      | "ownerId"
      | "ownerType"
      | "processedAt"
      | "status"
      | "stripeEventId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_status: ["status", "_creationTime"];
      by_stripeEventId: ["stripeEventId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingInvoices: {
    document: {
      amountDue: number;
      amountPaid: number;
      billingCustomerId: Id<"billingCustomers">;
      createdAt: string;
      currency: string;
      hostedInvoiceUrl?: string;
      invoicePdf?: string;
      periodEnd?: number;
      periodStart?: number;
      status: string;
      stripeInvoiceId: string;
      stripeSubscriptionId?: string;
      updatedAt: string;
      _id: Id<"billingInvoices">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amountDue"
      | "amountPaid"
      | "billingCustomerId"
      | "createdAt"
      | "currency"
      | "hostedInvoiceUrl"
      | "invoicePdf"
      | "periodEnd"
      | "periodStart"
      | "status"
      | "stripeInvoiceId"
      | "stripeSubscriptionId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_billingCustomerId: ["billingCustomerId", "_creationTime"];
      by_stripeInvoiceId: ["stripeInvoiceId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingSubscriptions: {
    document: {
      billingCustomerId: Id<"billingCustomers">;
      cancelAtPeriodEnd: boolean;
      canceledAt?: number;
      createdAt: string;
      currentPeriodEnd?: number;
      currentPeriodStart?: number;
      dunningStatus?: "none" | "past_due" | "unpaid" | "canceled";
      latestInvoiceId?: string;
      ownerId: string;
      ownerType: "user" | "company";
      planId: string;
      status: string;
      stripePriceId: string;
      stripeSubscriptionId: string;
      trialEnd?: number;
      updatedAt: string;
      _id: Id<"billingSubscriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "billingCustomerId"
      | "cancelAtPeriodEnd"
      | "canceledAt"
      | "createdAt"
      | "currentPeriodEnd"
      | "currentPeriodStart"
      | "dunningStatus"
      | "latestInvoiceId"
      | "ownerId"
      | "ownerType"
      | "planId"
      | "status"
      | "stripePriceId"
      | "stripeSubscriptionId"
      | "trialEnd"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_billingCustomerId: ["billingCustomerId", "_creationTime"];
      by_owner: ["ownerType", "ownerId", "_creationTime"];
      by_status: ["status", "_creationTime"];
      by_stripeSubscriptionId: ["stripeSubscriptionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  certificateProfiles: {
    document: {
      authority: "faa" | "easa" | "isbao" | "as9100" | "icao" | "other";
      certificateMetadata?: {
        certificateNumber?: string;
        expiryDate?: string;
        issuedDate?: string;
        lastAmendmentDate?: string;
        surveillanceAnchorDate?: string;
      };
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
      companyId?: Id<"companies">;
      createdAt: string;
      entityProfileId?: Id<"entityProfiles">;
      manualSet?: Array<{
        manualId?: Id<"manuals">;
        manualType: string;
        revision?: string;
      }>;
      obligationSetVersion?: string;
      operationalScope?: {
        avionicsMaintenance?: boolean;
        baseMaintenance?: boolean;
        componentMaintenance?: boolean;
        geography?: string;
        lineMaintenance?: boolean;
        operationClass?: string;
        scopeKey?: string;
      };
      profileCode: string;
      projectId?: Id<"projects">;
      status: "active" | "provisional" | "suspended" | "expired" | "archived";
      updatedAt: string;
      userId: string;
      _id: Id<"certificateProfiles">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authority"
      | "certificateMetadata"
      | "certificateMetadata.certificateNumber"
      | "certificateMetadata.expiryDate"
      | "certificateMetadata.issuedDate"
      | "certificateMetadata.lastAmendmentDate"
      | "certificateMetadata.surveillanceAnchorDate"
      | "certificateType"
      | "companyId"
      | "createdAt"
      | "entityProfileId"
      | "manualSet"
      | "obligationSetVersion"
      | "operationalScope"
      | "operationalScope.avionicsMaintenance"
      | "operationalScope.baseMaintenance"
      | "operationalScope.componentMaintenance"
      | "operationalScope.geography"
      | "operationalScope.lineMaintenance"
      | "operationalScope.operationClass"
      | "operationalScope.scopeKey"
      | "profileCode"
      | "projectId"
      | "status"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_certificateType: [
        "companyId",
        "certificateType",
        "_creationTime",
      ];
      by_entityProfileId: ["entityProfileId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
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
  checklistOccurrences: {
    document: {
      checklistRunId: Id<"auditChecklistRuns">;
      closedAt?: string;
      completionComplete?: number;
      completionTotal?: number;
      createdAt: string;
      label?: string;
      lateReason?: string;
      occurrenceIndex: number;
      onTime?: boolean;
      plannedDueDate?: string;
      projectId: Id<"projects">;
      seriesId: Id<"checklistSeries">;
      updatedAt: string;
      userId: string;
      _id: Id<"checklistOccurrences">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "checklistRunId"
      | "closedAt"
      | "completionComplete"
      | "completionTotal"
      | "createdAt"
      | "label"
      | "lateReason"
      | "occurrenceIndex"
      | "onTime"
      | "plannedDueDate"
      | "projectId"
      | "seriesId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_checklistRunId: ["checklistRunId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_seriesId: ["seriesId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  checklistSeries: {
    document: {
      createdAt: string;
      framework: string;
      frameworkLabel: string;
      generatedFromTemplateVersion: string;
      intervalDays?: number;
      intervalMonths?: number;
      isRecurring: boolean;
      name: string;
      notes?: string;
      projectId: Id<"projects">;
      purpose: "pre_audit" | "recurring_ops" | "event";
      subtypeId?: string;
      subtypeLabel?: string;
      updatedAt: string;
      userId: string;
      _id: Id<"checklistSeries">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "framework"
      | "frameworkLabel"
      | "generatedFromTemplateVersion"
      | "intervalDays"
      | "intervalMonths"
      | "isRecurring"
      | "name"
      | "notes"
      | "projectId"
      | "purpose"
      | "subtypeId"
      | "subtypeLabel"
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
  companies: {
    document: {
      createdAt: string;
      createdBy: string;
      isActive: boolean;
      name: string;
      slug?: string;
      updatedAt: string;
      _id: Id<"companies">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "createdBy"
      | "isActive"
      | "name"
      | "slug"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_name: ["name", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  companyFeaturePolicies: {
    document: {
      billingPlanId?: string;
      carLifecycleWebhookSecret?: string;
      carLifecycleWebhookUrl?: string;
      companyId: Id<"companies">;
      createdAt: string;
      enabledAgents?: Array<string>;
      enabledFeatures?: Array<string>;
      enabledFrameworks?: Array<string>;
      entitlementSource?: "billing" | "manual";
      forceCompanyContextDefault?: boolean;
      logbookEnabled?: boolean;
      logbookEntitlementMode?: "addon" | "standalone";
      updatedAt: string;
      _id: Id<"companyFeaturePolicies">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "billingPlanId"
      | "carLifecycleWebhookSecret"
      | "carLifecycleWebhookUrl"
      | "companyId"
      | "createdAt"
      | "enabledAgents"
      | "enabledFeatures"
      | "enabledFrameworks"
      | "entitlementSource"
      | "forceCompanyContextDefault"
      | "logbookEnabled"
      | "logbookEntitlementMode"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  companyMemberships: {
    document: {
      addedBy?: string;
      companyId: Id<"companies">;
      createdAt: string;
      role: string;
      status?: string;
      updatedAt: string;
      userId: string;
      _id: Id<"companyMemberships">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "addedBy"
      | "companyId"
      | "createdAt"
      | "role"
      | "status"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_userId: ["companyId", "userId", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  companySupportAssignments: {
    document: {
      assignedBy: string;
      companyId: Id<"companies">;
      createdAt: string;
      isActive: boolean;
      supportUserId: string;
      updatedAt: string;
      _id: Id<"companySupportAssignments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "assignedBy"
      | "companyId"
      | "createdAt"
      | "isActive"
      | "supportUserId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_supportUserId: [
        "companyId",
        "supportUserId",
        "_creationTime",
      ];
      by_supportUserId: ["supportUserId", "_creationTime"];
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
  dctBulkDeleteJobs: {
    document: {
      companyId: Id<"companies">;
      createdAt: string;
      deletedDocs: number;
      deletedParsedDocs: number;
      deletedParsedQuestions: number;
      lastError?: string;
      pendingContentHashes: Array<string>;
      projectId: Id<"projects">;
      requestedBy: string;
      status: "queued" | "running" | "completed" | "failed" | "cancelled";
      totalEstimate?: number;
      updatedAt: string;
      _id: Id<"dctBulkDeleteJobs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "companyId"
      | "createdAt"
      | "deletedDocs"
      | "deletedParsedDocs"
      | "deletedParsedQuestions"
      | "lastError"
      | "pendingContentHashes"
      | "projectId"
      | "requestedBy"
      | "status"
      | "totalEstimate"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId_createdAt: ["companyId", "createdAt", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_status: ["projectId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctComparisons: {
    document: {
      applicabilityConfidence?: number;
      applicabilitySource?: string;
      applicabilityState?: "applicable" | "unsure" | "not_applicable";
      evidenceSnippet?: string;
      projectId: Id<"projects">;
      questionId: Id<"dctQuestions">;
      rationale?: string;
      resolved?: boolean;
      severity?: "critical" | "major" | "minor" | "observation";
      status: "pending" | "aligned" | "gap" | "mismatch";
      underReviewDocumentId?: Id<"documents">;
      updatedAt: string;
      userId: string;
      _id: Id<"dctComparisons">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "applicabilityConfidence"
      | "applicabilitySource"
      | "applicabilityState"
      | "evidenceSnippet"
      | "projectId"
      | "questionId"
      | "rationale"
      | "resolved"
      | "severity"
      | "status"
      | "underReviewDocumentId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_questionId: ["questionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctDocumentChecks: {
    document: {
      completedAt?: string;
      createdAt: string;
      findings?: any;
      model?: string;
      notes?: string;
      perspectiveAgentId?: string;
      projectId: Id<"projects">;
      scope?: string;
      startedAt: string;
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
      updatedAt?: string;
      userId: string;
      verdict?: "pass" | "conditional" | "fail" | "pending";
      _id: Id<"dctDocumentChecks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "createdAt"
      | "findings"
      | "model"
      | "notes"
      | "perspectiveAgentId"
      | "projectId"
      | "scope"
      | "startedAt"
      | "status"
      | "totals"
      | "totals.aligned"
      | "totals.critical"
      | "totals.gap"
      | "totals.major"
      | "totals.minor"
      | "totals.mismatch"
      | "totals.observation"
      | "totals.pending"
      | "totals.questions"
      | "updatedAt"
      | "userId"
      | "verdict";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctParsedLibraryDocuments: {
    document: {
      assessmentTypeLabel?: string;
      companyId: Id<"companies">;
      contentHash: string;
      createdAt: string;
      dctStatus?: string;
      dctVersionDate?: string;
      dctVersionNumber?: string;
      fileName?: string;
      mlfId?: string;
      mlfLabel?: string;
      mlfName?: string;
      objective?: string;
      peerGroupLabel?: string;
      purpose?: string;
      questionCount: number;
      sourceSharedReferenceDocumentId?: Id<"sharedReferenceDocuments">;
      specialtyLabel?: string;
      standardDctDetailId?: string;
      standardDctId?: string;
      updatedAt: string;
      _id: Id<"dctParsedLibraryDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "assessmentTypeLabel"
      | "companyId"
      | "contentHash"
      | "createdAt"
      | "dctStatus"
      | "dctVersionDate"
      | "dctVersionNumber"
      | "fileName"
      | "mlfId"
      | "mlfLabel"
      | "mlfName"
      | "objective"
      | "peerGroupLabel"
      | "purpose"
      | "questionCount"
      | "sourceSharedReferenceDocumentId"
      | "specialtyLabel"
      | "standardDctDetailId"
      | "standardDctId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_hash: ["companyId", "contentHash", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctParsedLibraryQuestions: {
    document: {
      companyId: Id<"companies">;
      contentHash: string;
      createdAt: string;
      displayOrder?: number;
      noteToUser?: string;
      qVersionDate?: string;
      qVersionNumber?: string;
      questionDetailsId?: string;
      questionId: string;
      questionType?: string;
      references?: Array<{ label: string; srcId?: string }>;
      responses?: Array<string>;
      safetyAttribute?: string;
      scopingAttribute?: string;
      text: string;
      updatedAt: string;
      _id: Id<"dctParsedLibraryQuestions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "companyId"
      | "contentHash"
      | "createdAt"
      | "displayOrder"
      | "noteToUser"
      | "questionDetailsId"
      | "questionId"
      | "questionType"
      | "qVersionDate"
      | "qVersionNumber"
      | "references"
      | "responses"
      | "safetyAttribute"
      | "scopingAttribute"
      | "text"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId_hash: ["companyId", "contentHash", "_creationTime"];
      by_companyId_hash_questionId: [
        "companyId",
        "contentHash",
        "questionId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctProjectSettings: {
    document: {
      applicabilityMode?: "heuristics_only" | "structured_preferred";
      cachedComparisonTotal?: number;
      cachedQuestionCount?: number;
      dctLibraryTrackingMode?: "latest" | "pinned";
      excludedPeerGroupSubstrings?: Array<string>;
      includedPeerGroupSubstrings?: Array<string>;
      lastCheckCompletedAt?: string;
      lastDctLibrarySyncAt?: string;
      lastDctLibrarySyncSignatures?: Array<string>;
      lastStatus?: string;
      lastXmlIngestAt?: string;
      nextDueAt?: string;
      projectId: Id<"projects">;
      scheduleIntervalDays: number;
      selectedCapabilityIds?: Array<Id<"entityCapabilityList">>;
      selectedClassRatingIds?: Array<Id<"entityClassRatings">>;
      showAllDcts?: boolean;
      updatedAt: string;
      userId: string;
      _id: Id<"dctProjectSettings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "applicabilityMode"
      | "cachedComparisonTotal"
      | "cachedQuestionCount"
      | "dctLibraryTrackingMode"
      | "excludedPeerGroupSubstrings"
      | "includedPeerGroupSubstrings"
      | "lastCheckCompletedAt"
      | "lastDctLibrarySyncAt"
      | "lastDctLibrarySyncSignatures"
      | "lastStatus"
      | "lastXmlIngestAt"
      | "nextDueAt"
      | "projectId"
      | "scheduleIntervalDays"
      | "selectedCapabilityIds"
      | "selectedClassRatingIds"
      | "showAllDcts"
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
  dctQuestions: {
    document: {
      createdAt: string;
      dctDocumentId: Id<"dctToolDocuments">;
      displayOrder?: number;
      noteToUser?: string;
      projectId: Id<"projects">;
      qVersionDate?: string;
      qVersionNumber?: string;
      questionDetailsId?: string;
      questionId: string;
      questionType?: string;
      references?: Array<{ label: string; srcId?: string }>;
      responses?: Array<string>;
      safetyAttribute?: string;
      scopingAttribute?: string;
      text: string;
      _id: Id<"dctQuestions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "dctDocumentId"
      | "displayOrder"
      | "noteToUser"
      | "projectId"
      | "questionDetailsId"
      | "questionId"
      | "questionType"
      | "qVersionDate"
      | "qVersionNumber"
      | "references"
      | "responses"
      | "safetyAttribute"
      | "scopingAttribute"
      | "text";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_dctDocumentId: ["dctDocumentId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_questionId: ["projectId", "questionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctReports: {
    document: {
      createdAt: string;
      markdownBody?: string;
      projectId: Id<"projects">;
      stats?: any;
      title: string;
      userId: string;
      verdict: "pass" | "conditional" | "fail" | "pending";
      _id: Id<"dctReports">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "markdownBody"
      | "projectId"
      | "stats"
      | "title"
      | "userId"
      | "verdict";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctRevisionChecks: {
    document: {
      completedAt?: string;
      kind:
        | "xml_ingest"
        | "drs_sync"
        | "scheduled_tick"
        | "compare_run"
        | "library_version_update";
      newOrUpdatedCount?: number;
      projectId: Id<"projects">;
      startedAt: string;
      summary?: string;
      userId: string;
      _id: Id<"dctRevisionChecks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "kind"
      | "newOrUpdatedCount"
      | "projectId"
      | "startedAt"
      | "summary"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctToolDocuments: {
    document: {
      assessmentTypeLabel?: string;
      contentHash?: string;
      createdAt: string;
      dctStatus?: string;
      dctVersionDate?: string;
      dctVersionNumber?: string;
      fileName?: string;
      mlfId?: string;
      mlfLabel?: string;
      mlfName?: string;
      objective?: string;
      peerGroupLabel?: string;
      projectId: Id<"projects">;
      purpose?: string;
      source?: string;
      specialtyLabel?: string;
      standardDctDetailId?: string;
      standardDctId?: string;
      updatedAt: string;
      userId: string;
      _id: Id<"dctToolDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "assessmentTypeLabel"
      | "contentHash"
      | "createdAt"
      | "dctStatus"
      | "dctVersionDate"
      | "dctVersionNumber"
      | "fileName"
      | "mlfId"
      | "mlfLabel"
      | "mlfName"
      | "objective"
      | "peerGroupLabel"
      | "projectId"
      | "purpose"
      | "source"
      | "specialtyLabel"
      | "standardDctDetailId"
      | "standardDctId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_hash: ["projectId", "contentHash", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  dctTraceabilityRuns: {
    document: {
      agentId: string;
      cancelRequested?: boolean;
      completedAt?: string;
      error?: string;
      lastBadResponse?: string;
      lastHeartbeatAt: string;
      model: string;
      parseFailed: number;
      persistFailed: number;
      persisted: number;
      processed: number;
      projectId: Id<"projects">;
      runPayload?: {
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
      stallRetries?: number;
      startedAt: string;
      status: "queued" | "running" | "completed" | "failed" | "cancelled";
      total: number;
      userId: string;
      _id: Id<"dctTraceabilityRuns">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "agentId"
      | "cancelRequested"
      | "completedAt"
      | "error"
      | "lastBadResponse"
      | "lastHeartbeatAt"
      | "model"
      | "parseFailed"
      | "persisted"
      | "persistFailed"
      | "processed"
      | "projectId"
      | "runPayload"
      | "runPayload.applicabilityByComparisonId"
      | "runPayload.batchSize"
      | "runPayload.comparisonIds"
      | "runPayload.corpus"
      | "runPayload.docIds"
      | "runPayload.lowConfidenceByComparisonId"
      | "runPayload.systemPrompt"
      | "stallRetries"
      | "startedAt"
      | "status"
      | "total"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  documentChunks: {
    document: {
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
      _id: Id<"documentChunks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "category"
      | "chunkIndex"
      | "companyId"
      | "createdAt"
      | "docName"
      | "documentId"
      | "embedding"
      | "embeddingModel"
      | "embeddingProvider"
      | "endChar"
      | "projectId"
      | "startChar"
      | "text"
      | "totalChunks";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_documentId: ["documentId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {
      by_embedding: {
        vectorField: "embedding";
        dimensions: number;
        filterFields: "category" | "companyId" | "documentId" | "projectId";
      };
    };
  };
  documentIndexStatus: {
    document: {
      attempts: number;
      contentHash?: string;
      documentId: Id<"documents">;
      errorCode?: string;
      lastAttemptedAt: string;
      lastChunkCount?: number;
      lastError?: string;
      projectId: Id<"projects">;
      succeeded: boolean;
      _id: Id<"documentIndexStatus">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "contentHash"
      | "documentId"
      | "errorCode"
      | "lastAttemptedAt"
      | "lastChunkCount"
      | "lastError"
      | "projectId"
      | "succeeded";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_documentId: ["documentId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
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
      contentHash?: string;
      extractedAt: string;
      extractedText?: string;
      extractedTextStorageId?: Id<"_storage">;
      extractionMeta?: { backend: string; confidence?: number };
      folderId?: Id<"libraryFolders">;
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
      | "contentHash"
      | "extractedAt"
      | "extractedText"
      | "extractedTextStorageId"
      | "extractionMeta"
      | "extractionMeta.backend"
      | "extractionMeta.confidence"
      | "folderId"
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
      by_projectId_contentHash: ["projectId", "contentHash", "_creationTime"];
      by_projectId_folder: ["projectId", "folderId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityCapabilityList: {
    document: {
      articleDescription: string;
      authority?: "faa" | "easa" | "other";
      authorizedFunctions: Array<string>;
      clNumber?: string;
      companyId?: Id<"companies">;
      createdAt: string;
      entityProfileId: Id<"entityProfiles">;
      isActive?: boolean;
      make?: string;
      model?: string;
      normalizedTokens?: Array<string>;
      notes?: string;
      partNumber?: string;
      projectId?: Id<"projects">;
      technicalDataRef?: string;
      updatedAt: string;
      _id: Id<"entityCapabilityList">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "articleDescription"
      | "authority"
      | "authorizedFunctions"
      | "clNumber"
      | "companyId"
      | "createdAt"
      | "entityProfileId"
      | "isActive"
      | "make"
      | "model"
      | "normalizedTokens"
      | "notes"
      | "partNumber"
      | "projectId"
      | "technicalDataRef"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_entityProfileId: ["entityProfileId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityClassRatings: {
    document: {
      authority?: "faa" | "easa" | "other";
      category: string;
      classNumber: number;
      companyId?: Id<"companies">;
      createdAt: string;
      entityProfileId: Id<"entityProfiles">;
      isActive?: boolean;
      limitations?: string;
      normalizedTokens?: Array<string>;
      projectId?: Id<"projects">;
      updatedAt: string;
      _id: Id<"entityClassRatings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authority"
      | "category"
      | "classNumber"
      | "companyId"
      | "createdAt"
      | "entityProfileId"
      | "isActive"
      | "limitations"
      | "normalizedTokens"
      | "projectId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_entityProfileId: ["entityProfileId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityIssues: {
    document: {
      aiRootCauseAnalysis?: string;
      assessmentId?: string;
      carNumber?: string;
      certificateProfileId?: Id<"certificateProfiles">;
      closedAt?: string;
      correctiveAction?: string;
      createdAt: string;
      description: string;
      dueDate?: string;
      evidenceOfClosure?: string;
      externalId?: string;
      location?: string;
      obligationRuleId?: string;
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
      | "certificateProfileId"
      | "closedAt"
      | "correctiveAction"
      | "createdAt"
      | "description"
      | "dueDate"
      | "evidenceOfClosure"
      | "externalId"
      | "location"
      | "obligationRuleId"
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
      by_projectId_certificateProfileId: [
        "projectId",
        "certificateProfileId",
        "_creationTime",
      ];
      by_projectId_status: ["projectId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityLimitedRatings: {
    document: {
      articleDescription: string;
      authority?: "faa" | "easa" | "other";
      authorizedFunctions: Array<string>;
      companyId?: Id<"companies">;
      createdAt: string;
      easaCategory?: string;
      easaRating?: string;
      entityProfileId: Id<"entityProfiles">;
      isActive?: boolean;
      limitations?: string;
      make?: string;
      model?: string;
      normalizedTokens?: Array<string>;
      partNumber?: string;
      projectId?: Id<"projects">;
      ratingKind: string;
      updatedAt: string;
      _id: Id<"entityLimitedRatings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "articleDescription"
      | "authority"
      | "authorizedFunctions"
      | "companyId"
      | "createdAt"
      | "easaCategory"
      | "easaRating"
      | "entityProfileId"
      | "isActive"
      | "limitations"
      | "make"
      | "model"
      | "normalizedTokens"
      | "partNumber"
      | "projectId"
      | "ratingKind"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_entityProfileId: ["entityProfileId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityOpSpecs: {
    document: {
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
      createdAt: string;
      docType?: "opspec" | "mspec" | "tspec" | "loa";
      entityProfileId: Id<"entityProfiles">;
      expiryDate?: string;
      isActive: boolean;
      notes?: string;
      paragraph: string;
      projectId?: Id<"projects">;
      title?: string;
      updatedAt: string;
      _id: Id<"entityOpSpecs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "acceptedDate"
      | "authority"
      | "certPart"
      | "companyId"
      | "createdAt"
      | "docType"
      | "entityProfileId"
      | "expiryDate"
      | "isActive"
      | "notes"
      | "paragraph"
      | "projectId"
      | "title"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_entityProfileId: ["entityProfileId", "_creationTime"];
      by_entityProfileId_certPart_paragraph: [
        "entityProfileId",
        "certPart",
        "paragraph",
        "_creationTime",
      ];
      by_entityProfileId_paragraph: [
        "entityProfileId",
        "paragraph",
        "_creationTime",
      ];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  entityProfiles: {
    document: {
      aircraftCategories?: Array<string>;
      amCapabilities?: Array<string>;
      certifications?: Array<string>;
      cmmcLevel?: string;
      companyId?: Id<"companies">;
      companyName?: string;
      contactEmail?: string;
      contactName?: string;
      contactPhone?: string;
      createdAt: string;
      designAssuranceLevels?: { hardwareDal?: string; softwareDal?: string };
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
      importedFromAssessmentAt?: string;
      isDefenseContractor?: boolean;
      isbaoLevel?: string;
      itarRegistered?: boolean;
      labAccreditations?: Array<string>;
      lastSyncedAt?: string;
      legalEntityName?: string;
      nadcapAccreditations?: Array<string>;
      operationsScope?: string;
      part65Authorizations?: Array<string>;
      primaryLocation?: string;
      projectId?: Id<"projects">;
      qualityStandards?: Array<string>;
      repairStationType?: string;
      servicesOffered?: Array<string>;
      smsMaturity?: string;
      sourceAssessmentId?: Id<"assessments">;
      spacePrograms?: Array<string>;
      uasCertifications?: Array<string>;
      updatedAt: string;
      userId: string;
      _id: Id<"entityProfiles">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftCategories"
      | "amCapabilities"
      | "certifications"
      | "cmmcLevel"
      | "companyId"
      | "companyName"
      | "contactEmail"
      | "contactName"
      | "contactPhone"
      | "createdAt"
      | "designAssuranceLevels"
      | "designAssuranceLevels.hardwareDal"
      | "designAssuranceLevels.softwareDal"
      | "dfarsCompliant"
      | "easaApprovalRef"
      | "easaCompetentAuthority"
      | "easaForm4PostHolders"
      | "easaLineMaintenanceBases"
      | "easaPart145Expiry"
      | "easaPart147Ref"
      | "easaPart21Ref"
      | "easaPartCamoRef"
      | "easaPartCaoRef"
      | "employeeCount"
      | "faaCertificateDate"
      | "faaCertificateNumber"
      | "faaCertTypesHeld"
      | "faaChdo"
      | "faaLastAmendmentDate"
      | "faaPart121Certificate"
      | "faaPart125Certificate"
      | "faaPart129Certificate"
      | "faaPart133Certificate"
      | "faaPart135Certificate"
      | "faaPart137Certificate"
      | "faaPart141Certificate"
      | "faaPart142Certificate"
      | "faaPart147Certificate"
      | "faaPart91KCertificate"
      | "faaPeerGroup"
      | "facilitySquareFootage"
      | "hasSms"
      | "icaoStateOfRegistry"
      | "importedFromAssessmentAt"
      | "isbaoLevel"
      | "isDefenseContractor"
      | "itarRegistered"
      | "labAccreditations"
      | "lastSyncedAt"
      | "legalEntityName"
      | "nadcapAccreditations"
      | "operationsScope"
      | "part65Authorizations"
      | "primaryLocation"
      | "projectId"
      | "qualityStandards"
      | "repairStationType"
      | "servicesOffered"
      | "smsMaturity"
      | "sourceAssessmentId"
      | "spacePrograms"
      | "uasCertifications"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
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
      ataChapter?: string | null;
      category?: string | null;
      certificateProfileId?: Id<"certificateProfiles">;
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
      obligationRuleId?: string;
      projectId: Id<"projects">;
      regulationRef?: string | null;
      sourceDocumentId?: Id<"documents"> | string;
      sourceDocumentName?: string | null;
      sourceRevisionId?: string | null;
      sourceSectionIdOrRef?: string | null;
      title: string;
      updatedAt: string;
      userId: string;
      _id: Id<"inspectionScheduleItems">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "ataChapter"
      | "category"
      | "certificateProfileId"
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
      | "obligationRuleId"
      | "projectId"
      | "regulationRef"
      | "sourceDocumentId"
      | "sourceDocumentName"
      | "sourceRevisionId"
      | "sourceSectionIdOrRef"
      | "title"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_certificateProfileId: [
        "projectId",
        "certificateProfileId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  libraryFolders: {
    document: {
      companyId: Id<"companies">;
      createdAt: string;
      createdBy: string;
      name: string;
      parentFolderId?: Id<"libraryFolders">;
      sortOrder?: number;
      updatedAt: string;
      _id: Id<"libraryFolders">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "companyId"
      | "createdAt"
      | "createdBy"
      | "name"
      | "parentFolderId"
      | "sortOrder"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_parent: ["companyId", "parentFolderId", "_creationTime"];
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
      bookVolume?: string;
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
      sourceDiscrepancyId?: Id<"aircraftDiscrepancies">;
      sourceDocumentId?: Id<"documents">;
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
      | "bookVolume"
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
      | "sourceDiscrepancyId"
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
      bookVolume?: string;
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
      | "bookVolume"
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
      by_aircraftId_bookVolume: ["aircraftId", "bookVolume", "_creationTime"];
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
  manualGroups: {
    document: {
      companyId: Id<"companies">;
      createdAt: string;
      createdBy: string;
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
      updatedAt: string;
      _id: Id<"manualGroups">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "companyId"
      | "createdAt"
      | "createdBy"
      | "makeModel"
      | "manufacturer"
      | "name"
      | "notes"
      | "publicationType"
      | "revisionNumber"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  manualRevisionLinks: {
    document: {
      comparisonStatus: "match" | "mismatch" | "unknown";
      createdAt: string;
      detectedRevision?: string;
      documentName?: string;
      documentRevisionId?: Id<"documentRevisions">;
      lastSyncedAt: string;
      manualId: Id<"manuals">;
      manualRevisionId: Id<"manualRevisions">;
      manualRevisionNumber: string;
      matchConfidence?: number;
      projectId: Id<"projects">;
      sourceDocumentId?: Id<"documents">;
      updatedAt: string;
      _id: Id<"manualRevisionLinks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "comparisonStatus"
      | "createdAt"
      | "detectedRevision"
      | "documentName"
      | "documentRevisionId"
      | "lastSyncedAt"
      | "manualId"
      | "manualRevisionId"
      | "manualRevisionNumber"
      | "matchConfidence"
      | "projectId"
      | "sourceDocumentId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_manualId: ["manualId", "_creationTime"];
      by_manualRevisionId: ["manualRevisionId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_sourceDocumentId: ["sourceDocumentId", "_creationTime"];
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
      revisionTitle?: string;
      sourceDocumentId?: Id<"documents">;
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
      | "revisionTitle"
      | "sourceDocumentId"
      | "status"
      | "submittedAt"
      | "submittedBy"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_manualId: ["manualId", "_creationTime"];
      by_sourceDocumentId: ["sourceDocumentId", "_creationTime"];
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
      enabledCapabilities?: Array<string>;
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
      | "enabledCapabilities"
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
  obligationSetDefinitions: {
    document: {
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
      createdAt: string;
      createdBy: string;
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
      updatedAt: string;
      version: string;
      _id: Id<"obligationSetDefinitions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authority"
      | "certificateType"
      | "createdAt"
      | "createdBy"
      | "isActive"
      | "profileCode"
      | "rules"
      | "updatedAt"
      | "version";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_certificateType_version: [
        "certificateType",
        "version",
        "_creationTime",
      ];
      by_profileCode: ["profileCode", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  productEvents: {
    document: {
      actorId: string;
      createdAt: string;
      eventType: string;
      projectId?: Id<"projects">;
      properties?: string;
      _id: Id<"productEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorId"
      | "createdAt"
      | "eventType"
      | "projectId"
      | "properties";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_actorId_eventType: ["actorId", "eventType", "_creationTime"];
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
      region?: string;
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
      | "region"
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
      companyId?: Id<"companies">;
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
      | "companyId"
      | "createdAt"
      | "description"
      | "name"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_updatedAt: ["companyId", "updatedAt", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
      by_userId_updatedAt: ["userId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  publicationSections: {
    document: {
      ataChapter: string;
      ataSection?: string;
      chunkIds?: Array<Id<"documentChunks">>;
      createdAt: string;
      depth: number;
      endPage: number;
      parentSectionId?: Id<"publicationSections">;
      publicationId: Id<"technicalPublications">;
      startPage: number;
      title: string;
      updatedAt: string;
      _id: Id<"publicationSections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "ataChapter"
      | "ataSection"
      | "chunkIds"
      | "createdAt"
      | "depth"
      | "endPage"
      | "parentSectionId"
      | "publicationId"
      | "startPage"
      | "title"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_publicationId: ["publicationId", "_creationTime"];
      by_publicationId_ataChapter: [
        "publicationId",
        "ataChapter",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  rosterAssignments: {
    document: {
      assignedDate?: string;
      createdAt: string;
      dueDate?: string;
      evidence?: Record<string, string>;
      evidenceLink?: string;
      graceDaysOverride?: number;
      lastCompletedDate?: string;
      needsRuleMigrationReview?: boolean;
      notes?: string;
      personId: Id<"rosterPersonnel">;
      projectId: Id<"projects">;
      recurrenceDaysOverride?: number;
      recurrenceIntervalUnitOverride?: "days" | "months" | "years";
      recurrenceIntervalValueOverride?: number;
      requirementTypeId: Id<"rosterRequirementTypes">;
      updatedAt: string;
      userId: string;
      _id: Id<"rosterAssignments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "assignedDate"
      | "createdAt"
      | "dueDate"
      | "evidence"
      | `evidence.${string}`
      | "evidenceLink"
      | "graceDaysOverride"
      | "lastCompletedDate"
      | "needsRuleMigrationReview"
      | "notes"
      | "personId"
      | "projectId"
      | "recurrenceDaysOverride"
      | "recurrenceIntervalUnitOverride"
      | "recurrenceIntervalValueOverride"
      | "requirementTypeId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_personId: ["personId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_requirementTypeId: ["requirementTypeId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  rosterPersonnel: {
    document: {
      capabilities: Array<string>;
      certificateNumber?: string;
      createdAt: string;
      employeeId?: string;
      fullName: string;
      isActive: boolean;
      jobDescription?: string;
      projectId: Id<"projects">;
      roleTitle?: string;
      updatedAt: string;
      userId: string;
      _id: Id<"rosterPersonnel">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "capabilities"
      | "certificateNumber"
      | "createdAt"
      | "employeeId"
      | "fullName"
      | "isActive"
      | "jobDescription"
      | "projectId"
      | "roleTitle"
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
  rosterRequirementTypes: {
    document: {
      category?: string;
      createdAt: string;
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
      isActive: boolean;
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
      updatedAt: string;
      userId: string;
      _id: Id<"rosterRequirementTypes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "category"
      | "createdAt"
      | "defaultCalendarMonths"
      | "defaultGraceDays"
      | "defaultIntervalUnit"
      | "defaultIntervalValue"
      | "defaultRecurrenceDays"
      | "description"
      | "dueDateStrategy"
      | "isActive"
      | "name"
      | "projectId"
      | "promptSchema"
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
  sharedAgentDocuments: {
    document: {
      addedAt: string;
      addedBy: string;
      agentId: string;
      companyId?: Id<"companies">;
      extractedText?: string;
      mimeType?: string;
      name: string;
      path: string;
      region?: string;
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
      | "companyId"
      | "extractedText"
      | "mimeType"
      | "name"
      | "path"
      | "region"
      | "source"
      | "storageId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_agentId: ["agentId", "_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sharedReferenceDocuments: {
    document: {
      addedAt: string;
      addedBy: string;
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
      _id: Id<"sharedReferenceDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "addedAt"
      | "addedBy"
      | "canonicalDocType"
      | "companyId"
      | "contentHash"
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
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_documentType: ["companyId", "documentType", "_creationTime"];
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
  technicalPublications: {
    document: {
      aircraftIds?: Array<Id<"aircraftAssets">>;
      aircraftTypeIds?: Array<Id<"aircraftTypes">>;
      companyId: Id<"companies">;
      createdAt: string;
      documentId: Id<"documents">;
      effectiveDate?: string;
      folderId?: Id<"libraryFolders">;
      makeModel?: string;
      manualGroupId?: Id<"manualGroups">;
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
      updatedAt: string;
      uploadedBy: string;
      _id: Id<"technicalPublications">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aircraftIds"
      | "aircraftTypeIds"
      | "companyId"
      | "createdAt"
      | "documentId"
      | "effectiveDate"
      | "folderId"
      | "makeModel"
      | "manualGroupId"
      | "manufacturer"
      | "notes"
      | "partNumber"
      | "projectId"
      | "publicationType"
      | "revisionDate"
      | "revisionNumber"
      | "title"
      | "updatedAt"
      | "uploadedBy";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_companyId: ["companyId", "_creationTime"];
      by_companyId_folder: ["companyId", "folderId", "_creationTime"];
      by_companyId_publicationType: [
        "companyId",
        "publicationType",
        "_creationTime",
      ];
      by_documentId: ["documentId", "_creationTime"];
      by_manualGroupId: ["manualGroupId", "_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      approvalStatus?: string;
      approvedAt?: string;
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
      | "approvalStatus"
      | "approvedAt"
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
      by_approvalStatus: ["approvalStatus", "_creationTime"];
      by_clerkUserId: ["clerkUserId", "_creationTime"];
      by_email: ["email", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  userSettings: {
    document: {
      activeCompanyId?: Id<"companies">;
      activeProjectId?: Id<"projects">;
      adaptiveThinking?: boolean;
      adaptiveThinkingEffort?: string;
      auditSimModel?: string;
      avianisApiKey?: string;
      avianisAuthMethod?: string;
      avianisBaseUrl?: string;
      avianisCachedToken?: string;
      avianisCachedTokenExpiresAt?: number;
      avianisClientId?: string;
      avianisClientSecret?: string;
      avianisLastSyncError?: string;
      avianisLastSyncedAt?: number;
      avianisPassword?: string;
      avianisTenantId?: string;
      avianisUsername?: string;
      billingPlanId?: string;
      claudeModel?: string;
      dctDocumentCheckAgentId?: string;
      dctDocumentCheckModel?: string;
      dctTraceabilityAgentId?: string;
      dctTraceabilityModel?: string;
      enabledAgents?: Array<string>;
      enabledFeatures?: Array<string>;
      enabledFrameworks?: Array<string>;
      entitlementSource?: "billing" | "manual";
      forceCompanyContextDefault?: boolean;
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
      | "activeCompanyId"
      | "activeProjectId"
      | "adaptiveThinking"
      | "adaptiveThinkingEffort"
      | "auditSimModel"
      | "avianisApiKey"
      | "avianisAuthMethod"
      | "avianisBaseUrl"
      | "avianisCachedToken"
      | "avianisCachedTokenExpiresAt"
      | "avianisClientId"
      | "avianisClientSecret"
      | "avianisLastSyncedAt"
      | "avianisLastSyncError"
      | "avianisPassword"
      | "avianisTenantId"
      | "avianisUsername"
      | "billingPlanId"
      | "claudeModel"
      | "dctDocumentCheckAgentId"
      | "dctDocumentCheckModel"
      | "dctTraceabilityAgentId"
      | "dctTraceabilityModel"
      | "enabledAgents"
      | "enabledFeatures"
      | "enabledFrameworks"
      | "entitlementSource"
      | "forceCompanyContextDefault"
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
