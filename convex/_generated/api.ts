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
  documentReviews: {
    create: FunctionReference<
      "mutation",
      "public",
      {
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
        source: "audit_sim" | "paperwork_review" | "analysis" | "manual";
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
        description?: string;
        issueId: Id<"entityIssues">;
        location?: string;
        regulationRef?: string;
        severity?: "critical" | "major" | "minor" | "observation";
        title?: string;
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
        documentType: string;
        extractedText?: string;
        mimeType?: string;
        name: string;
        path: string;
        source: string;
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
