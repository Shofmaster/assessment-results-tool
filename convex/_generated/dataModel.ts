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
  documentReviews: {
    document: {
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
      assessmentId?: string;
      createdAt: string;
      description: string;
      location?: string;
      projectId: Id<"projects">;
      regulationRef?: string;
      severity: "critical" | "major" | "minor" | "observation";
      source: "audit_sim" | "paperwork_review" | "analysis" | "manual";
      sourceId?: string;
      title: string;
      userId: string;
      _id: Id<"entityIssues">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "assessmentId"
      | "createdAt"
      | "description"
      | "location"
      | "projectId"
      | "regulationRef"
      | "severity"
      | "source"
      | "sourceId"
      | "title"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_projectId: ["projectId", "_creationTime"];
      by_projectId_assessment: ["projectId", "assessmentId", "_creationTime"];
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
      documentType: string;
      extractedText?: string;
      mimeType?: string;
      name: string;
      path: string;
      source: string;
      storageId?: Id<"_storage">;
      _id: Id<"sharedReferenceDocuments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "addedAt"
      | "addedBy"
      | "documentType"
      | "extractedText"
      | "mimeType"
      | "name"
      | "path"
      | "source"
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
