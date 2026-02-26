import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { resolveModel } from '../services/llmConfig';

export interface AvailableClaudeModel {
  id: string;
  display_name: string;
  created_at: string;
  /** Extended thinking (Claude only); may be undefined for older API responses. */
  supportsThinking?: boolean;
}

// --- User ---------------------------------------------------------------
export function useCurrentDbUser() {
  return useQuery(api.users.getCurrent);
}

export function useIsAdmin() {
  const user = useCurrentDbUser();
  return user?.role === 'admin';
}

export function useAllUsers() {
  return useQuery(api.users.listAll);
}

// --- Projects -----------------------------------------------------------
export function useProjects() {
  return useQuery(api.projects.list);
}

export function useProject(projectId: string | undefined) {
  return useQuery(api.projects.get, projectId ? { projectId: projectId as any } : 'skip');
}

export function useCreateProject() {
  return useMutation(api.projects.create);
}

export function useUpdateProject() {
  return useMutation(api.projects.update);
}

export function useDeleteProject() {
  return useMutation(api.projects.remove);
}

// --- Assessments --------------------------------------------------------
export function useAssessments(projectId: string | undefined) {
  return useQuery(api.assessments.listByProject, projectId ? { projectId: projectId as any } : 'skip');
}

export function useAddAssessment() {
  return useMutation(api.assessments.add);
}

export function useRemoveAssessment() {
  return useMutation(api.assessments.remove);
}

// --- Documents ----------------------------------------------------------
export function useDocuments(projectId: string | undefined, category?: string) {
  return useQuery(
    api.documents.listByProject,
    projectId ? { projectId: projectId as any, category } : 'skip'
  );
}

export function useAddDocument() {
  return useMutation(api.documents.add);
}

export function useRemoveDocument() {
  return useMutation(api.documents.remove);
}

export function useClearDocuments() {
  return useMutation(api.documents.clear);
}

// --- Analyses -----------------------------------------------------------
/** List of analysis summaries (no findings/recommendations). Use useAnalysis(id) for full detail. */
export function useAnalyses(projectId: string | undefined) {
  return useQuery(api.analyses.listByProject, projectId ? { projectId: projectId as any } : 'skip');
}

/** Full analysis including findings, recommendations, compliance. Use when viewing analysis detail. */
export function useAnalysis(analysisId: string | undefined) {
  return useQuery(
    (api as any).analyses.get,
    analysisId ? { analysisId: analysisId as Id<'analyses'> } : 'skip'
  );
}

export function useAddAnalysis() {
  return useMutation(api.analyses.add);
}

// --- Simulation Results -------------------------------------------------
/** List of run summaries (no messages). Use useSimulationResult(id) for full run with messages. */
export function useSimulationResults(projectId: string | undefined) {
  return useQuery(api.simulationResults.listByProject, projectId ? { projectId: projectId as any } : 'skip');
}

/** Full simulation result including messages. Use when viewing or comparing a run. */
export function useSimulationResult(simulationId: string | undefined) {
  return useQuery(
    (api as any).simulationResults.get,
    simulationId ? { simulationId: simulationId as Id<'simulationResults'> } : 'skip'
  );
}

export function useAddSimulationResult() {
  return useMutation(api.simulationResults.add);
}

export function useRemoveSimulationResult() {
  return useMutation(api.simulationResults.remove);
}

// --- Document Revisions -------------------------------------------------
export function useDocumentRevisions(projectId: string | undefined) {
  return useQuery(api.documentRevisions.listByProject, projectId ? { projectId: projectId as any } : 'skip');
}

export function useSetDocumentRevisions() {
  return useMutation(api.documentRevisions.set);
}

export function useUpdateDocumentRevision() {
  return useMutation(api.documentRevisions.update);
}

// --- Project Agent Documents --------------------------------------------
export function useProjectAgentDocs(projectId: string | undefined, agentId?: string) {
  return useQuery(
    api.projectAgentDocuments.listByProjectAndAgent,
    projectId && agentId ? { projectId: projectId as any, agentId } : 'skip'
  );
}

export function useAllProjectAgentDocs(projectId: string | undefined) {
  return useQuery(
    api.projectAgentDocuments.listByProject,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

export function useAddProjectAgentDoc() {
  return useMutation(api.projectAgentDocuments.add);
}

export function useRemoveProjectAgentDoc() {
  return useMutation(api.projectAgentDocuments.remove);
}

export function useClearProjectAgentDocs() {
  return useMutation(api.projectAgentDocuments.clear);
}

// --- Shared Agent Documents (KB Repository) -----------------------------
export function useSharedAgentDocs(agentId?: string) {
  return useQuery(
    api.sharedAgentDocuments.listByAgent,
    agentId ? { agentId } : 'skip'
  );
}

export function useAllSharedAgentDocs() {
  return useQuery(api.sharedAgentDocuments.listAll);
}

/** Shared docs for the given agent ids (for simulations); any authenticated user. */
export function useSharedAgentDocsByAgents(agentIds: string[]) {
  return useQuery(
    api.sharedAgentDocuments.listByAgents,
    agentIds.length > 0 ? { agentIds } : 'skip'
  );
}

export function useAddSharedAgentDoc() {
  return useMutation(api.sharedAgentDocuments.add);
}

export function useRemoveSharedAgentDoc() {
  return useMutation(api.sharedAgentDocuments.remove);
}

export function useClearSharedAgentDocs() {
  return useMutation(api.sharedAgentDocuments.clearByAgent);
}

// --- Shared Reference Documents (Admin → Paperwork Review) ----------------
export function useAllSharedReferenceDocs() {
  return useQuery(api.sharedReferenceDocuments.listAll);
}

export function useAllSharedReferenceDocsAdmin() {
  return useQuery(api.sharedReferenceDocuments.listAllAdmin);
}

export function useSharedReferenceDocsByType(documentType?: string) {
  return useQuery(
    api.sharedReferenceDocuments.listByType,
    documentType ? { documentType } : 'skip'
  );
}

export function useAddSharedReferenceDoc() {
  return useMutation(api.sharedReferenceDocuments.add);
}

export function useRemoveSharedReferenceDoc() {
  return useMutation(api.sharedReferenceDocuments.remove);
}

export function useClearSharedReferenceDocs() {
  return useMutation(api.sharedReferenceDocuments.clearByType);
}

// --- Document Reviews (Paperwork Review) ---------------------------------
export function useDocumentReviews(projectId: string | undefined) {
  return useQuery(
    api.documentReviews.listByProject,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

/** Full review by id. Use when editing or when list only has summary. */
export function useDocumentReview(reviewId: string | undefined) {
  return useQuery(
    (api as any).documentReviews.get,
    reviewId ? { reviewId: reviewId as Id<'documentReviews'> } : 'skip'
  );
}

export function useDocumentReviewsByUnderReview(
  projectId: string | undefined,
  underReviewDocumentId: string | undefined
) {
  return useQuery(
    api.documentReviews.listByProjectAndUnderReview,
    projectId && underReviewDocumentId
      ? { projectId: projectId as any, underReviewDocumentId: underReviewDocumentId as any }
      : 'skip'
  );
}

export function useAddDocumentReview() {
  return useMutation(api.documentReviews.create);
}

export function useUpdateDocumentReview() {
  return useMutation(api.documentReviews.update);
}

export function useRemoveDocumentReview() {
  return useMutation(api.documentReviews.remove);
}

// --- Inspection Schedule ------------------------------------------------
export function useInspectionScheduleItems(projectId: string | undefined) {
  return useQuery(
    api.inspectionSchedule.listByProject,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

export function useAddInspectionScheduleItems() {
  return useMutation(api.inspectionSchedule.addItems);
}

export function useUpdateInspectionScheduleLastPerformed() {
  return useMutation(api.inspectionSchedule.updateLastPerformed);
}

export function useUpdateInspectionScheduleItem() {
  return useMutation(api.inspectionSchedule.updateItem);
}

export function useRemoveInspectionScheduleItem() {
  return useMutation(api.inspectionSchedule.removeItem);
}

export function useNormalizeInspectionScheduleItems() {
  return useMutation((api as any).inspectionSchedule.normalizeProjectItems);
}

// --- Entity Issues (Problem areas) ---------------------------------------
export function useEntityIssues(projectId: string | undefined, assessmentId?: string) {
  return useQuery(
    api.entityIssues.listByProject,
    projectId ? { projectId: projectId as any, assessmentId } : 'skip'
  );
}

export function useAddEntityIssue() {
  return useMutation(api.entityIssues.add);
}

export function useUpdateEntityIssue() {
  return useMutation(api.entityIssues.update);
}

export function useRemoveEntityIssue() {
  return useMutation(api.entityIssues.remove);
}

// --- User Settings ------------------------------------------------------
export function useUserSettings() {
  return useQuery(api.userSettings.get);
}

export function useUpsertUserSettings() {
  return useMutation(api.userSettings.upsert);
}

/** Default model for general analysis, document extraction, revision check, etc. */
export function useDefaultClaudeModel(): string {
  const settings = useUserSettings();
  return resolveModel('default', settings);
}

/** Model for audit simulation (falls back to default if not set). */
export function useAuditSimModel(): string {
  const settings = useUserSettings();
  return resolveModel('auditSim', settings);
}

/** Model for paperwork review (falls back to default if not set). */
export function usePaperworkReviewModel(): string {
  const settings = useUserSettings();
  return resolveModel('paperworkReview', settings);
}

/** Agent perspective for paperwork review (falls back to generic if not set). */
export function usePaperworkReviewAgentId(): string {
  const settings = useUserSettings();
  return settings?.paperworkReviewAgentId ?? 'generic';
}

/** Fetch available Claude models from API. Used by Settings and feature-specific model selectors. */
export function useAvailableClaudeModels() {
  const [models, setModels] = useState<AvailableClaudeModel[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claude-models');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setModels(data.models ?? []);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { models, loading, refetch };
}

// --- File Storage -------------------------------------------------------
export function useGenerateUploadUrl() {
  return useMutation(api.fileActions.generateUploadUrl);
}

// --- User Management (Admin) --------------------------------------------
export function useUpsertUser() {
  return useMutation(api.users.upsertFromClerk);
}

export function useSetUserRole() {
  return useMutation(api.users.setRole);
}
