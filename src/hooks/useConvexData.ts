import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export interface AvailableClaudeModel {
  id: string;
  display_name: string;
  created_at: string;
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
export function useAnalyses(projectId: string | undefined) {
  return useQuery(api.analyses.listByProject, projectId ? { projectId: projectId as any } : 'skip');
}

export function useAddAnalysis() {
  return useMutation(api.analyses.add);
}

// --- Simulation Results -------------------------------------------------
export function useSimulationResults(projectId: string | undefined) {
  return useQuery(api.simulationResults.listByProject, projectId ? { projectId: projectId as any } : 'skip');
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

// --- User Settings ------------------------------------------------------
export function useUserSettings() {
  return useQuery(api.userSettings.get);
}

export function useUpsertUserSettings() {
  return useMutation(api.userSettings.upsert);
}

/** Fetch available Claude models from API. Used by Paperwork Review and Audit Simulation model selectors. */
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
