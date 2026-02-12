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
  fileActions: {
    generateUploadUrl: FunctionReference<"mutation", "public", {}, any>;
    getFileUrl: FunctionReference<
      "query",
      "public",
      { storageId: Id<"_storage"> },
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
  quizSubmissions: {
    list: FunctionReference<"query", "public", {}, any>;
    requestFullReview: FunctionReference<
      "mutation",
      "public",
      { submissionId: Id<"quizSubmissions"> },
      any
    >;
    submit: FunctionReference<
      "mutation",
      "public",
      {
        companyName: string;
        consentToContact: boolean;
        contactName: string;
        email: string;
        flaggedAreas: Array<string>;
        phone: string;
        quizAnswers: any;
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
    remove: FunctionReference<
      "mutation",
      "public",
      { documentId: Id<"sharedAgentDocuments"> },
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
        activeProjectId?: Id<"projects">;
        googleApiKey?: string;
        googleClientId?: string;
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
