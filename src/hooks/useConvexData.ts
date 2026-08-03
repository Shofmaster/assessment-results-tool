import { useState, useCallback, useEffect, useMemo } from 'react';
import { useMutation, useAction, useConvex, useConvexAuth, usePaginatedQuery } from 'convex/react';
import { useQuery } from './useConvexQueryNoThrow';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import { resolveModel } from '../services/llmConfig';
import {
  searchDocuments,
  searchProjectDocuments,
  type SearchDocumentsArgs,
} from '../services/driveSearchIntegration';
import { buildScheduleLogbookCrossRef } from '../services/scheduleLogbookCrossRef';
import type { InspectionScheduleItem } from '../types/inspectionSchedule';
import type { LogbookEntry } from '../types/logbook';
import {
  applyBillingEnforcement,
  intersectEnabledLists,
  resolveLogbookEnabled,
} from '../utils/entitlementResolution';
import { FEATURE_KEYS } from '../config/featureKeys';
import { track, ANALYTICS_EVENTS } from '../services/analyticsEvents';

/** If an allowlist omits `quality-command-center` but enables other QM modules, still show the hub (legacy policies). */
const IMPLICIT_QUALITY_HUB_FEATURE_KEYS: readonly string[] = [
  FEATURE_KEYS.ENTITY_ISSUES,
  FEATURE_KEYS.CHECKLISTS,
  FEATURE_KEYS.GUIDED_AUDIT,
  FEATURE_KEYS.REVISIONS,
  FEATURE_KEYS.REPORT_BUILDER,
  FEATURE_KEYS.ANALYSIS,
  FEATURE_KEYS.PAPERWORK_REVIEW,
  FEATURE_KEYS.LIBRARY,
  FEATURE_KEYS.SCHEDULE,
  FEATURE_KEYS.AUDIT_SIMULATION,
  FEATURE_KEYS.ANALYTICS,
  FEATURE_KEYS.DCT_COMPLIANCE,
];

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

export function useIsAerogapEmployee() {
  const user = useCurrentDbUser();
  return user?.role === 'aerogap_employee' || user?.role === 'admin';
}

export function useCompanySummariesForStaff() {
  const isStaff = useIsAerogapEmployee();
  return useQuery(api.companies.listSummariesForStaff, isStaff ? {} : 'skip');
}

export function useMyAdminCompanies() {
  return useQuery(api.companies.listMyAdminCompanies, {});
}

export function useLookupUserByEmailForCompany(companyId: string | undefined, email: string) {
  const trimmed = email.trim();
  return useQuery(
    api.users.lookupByEmailForCompanyAdmin,
    companyId && trimmed ? { companyId: companyId as Id<"companies">, email: trimmed } : 'skip',
  );
}

export function useListPlatformStaffForSupportPicker(companyId: string | undefined) {
  return useQuery(
    api.users.listPlatformStaffForSupportPicker,
    companyId ? { companyId: companyId as Id<"companies"> } : 'skip',
  );
}

/** Full user directory; Convex allows platform staff — only AdminPanel mounts this (admin-only route). */
export function useAllUsers() {
  const isAdmin = useIsAdmin();
  return useQuery(api.users.listAll, isAdmin ? {} : 'skip');
}

/** Admin panel: users awaiting manual approval. Only fetched for admins. */
export function usePendingUsers() {
  const isAdmin = useIsAdmin();
  return useQuery(api.users.listPending, isAdmin ? {} : 'skip');
}

export function useSetApprovalStatus() {
  return useMutation(api.users.setApprovalStatus);
}

// --- Feedback -----------------------------------------------------------

export function useSubmitFeedback() {
  return useMutation(api.feedback.submit);
}

export function useFeedbackList() {
  const isStaff = useIsAerogapEmployee();
  return useQuery(api.feedback.list, isStaff ? {} : 'skip');
}

export function useSetFeedbackStatus() {
  return useMutation(api.feedback.setStatus);
}

/** Admin panel: members of a company (+ optional platform staff rows for role tooling). */
export function useUserDirectoryForCompany(
  companyId: string | undefined,
  includePlatformStaff?: boolean,
) {
  const isAdmin = useIsAdmin();
  return useQuery(
    api.users.listDirectoryForCompany,
    isAdmin && companyId
      ? { companyId: companyId as Id<'companies'>, includePlatformStaff }
      : 'skip',
  );
}

/**
 * Company used for shared KB / reference visibility: staff use sidebar scope; others use active project’s company.
 */
export function useComplianceScopeCompanyId(): string | undefined {
  const isStaff = useIsAerogapEmployee();
  const settings = useUserSettings();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const projects = useProjects() as any[] | undefined;

  return useMemo(() => {
    if (isStaff) {
      const id = settings?.activeCompanyId;
      return id ? String(id) : undefined;
    }
    if (!activeProjectId || !projects) return undefined;
    const p = projects.find((x: any) => String(x._id) === String(activeProjectId));
    if (p?.companyId) return String(p.companyId);
    return undefined;
  }, [isStaff, settings?.activeCompanyId, activeProjectId, projects]);
}

/** Shared reference docs: tenant overlay when `useComplianceScopeCompanyId` is set, else platform-wide only (legacy projects). */
export function useSharedReferenceDocsResolved() {
  const companyId = useComplianceScopeCompanyId();
  const scoped = useSharedReferenceDocsForCompany(companyId);
  const platformOnly = useAllSharedReferenceDocs();
  if (companyId) return scoped;
  return platformOnly;
}

/** Shared KB agent docs: scoped `listByAgents` when company is known, else platform-wide KB filtered by `agentIds`. */
export function useSharedAgentDocsByAgentsResolved(agentIds: string[]) {
  const companyId = useComplianceScopeCompanyId();
  const scoped = useSharedAgentDocsByAgents(agentIds, companyId);
  const platformAll = useAllSharedAgentDocs();
  if (companyId) return scoped;
  const list = platformAll || [];
  if (agentIds.length === 0) return list;
  return list.filter((d: any) => agentIds.includes(d.agentId));
}

// --- Projects -----------------------------------------------------------
export function useProjects() {
  return useQuery(api.projects.list);
}

export function useProjectsForCompanyManagement(companyId: string | undefined) {
  return useQuery(
    api.projects.listForCompanyManagement,
    companyId ? { companyId: companyId as Id<'companies'> } : 'skip',
  );
}

export function useListWhereCanManageProjectsCompanies() {
  return useQuery(api.companies.listWhereCanManageProjects, {});
}

export function useCompaniesForCurrentUser() {
  return useQuery(api.companies.listForCurrentUser);
}

export function useAllCompaniesAdmin() {
  return useQuery(api.companies.listAll);
}

export function useCreateCompany() {
  return useMutation(api.companies.create);
}

export function useUpdateCompany() {
  return useMutation(api.companies.update);
}

export function useCompanyMembers(companyId: string | undefined) {
  return useQuery(
    api.companies.listMembers,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip"
  );
}

export function useAddCompanyMember() {
  return useMutation(api.companies.addMember);
}

export function useRemoveCompanyMember() {
  return useMutation(api.companies.removeMember);
}

export function useCompanySupportAssignments(companyId: string | undefined) {
  return useQuery(
    api.companies.listSupportAssignments,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip"
  );
}

export function useAssignCompanySupportUser() {
  return useMutation(api.companies.assignSupportUser);
}

export function useRemoveCompanySupportAssignment() {
  return useMutation(api.companies.removeSupportAssignment);
}

export function useCompanyFeaturePolicyByProject(projectId: string | undefined) {
  return useQuery(
    api.companies.getFeaturePolicyByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useCompanyFeaturePolicy(companyId: string | undefined) {
  return useQuery(
    api.companies.getFeaturePolicy,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip"
  );
}

export function useUpsertCompanyFeaturePolicy() {
  return useMutation(api.companies.upsertFeaturePolicy);
}

/** AeroGap-admin-only: toggle classic copy storage for manufacturer docs per company. */
export function useSetManufacturerDocStorage() {
  return useMutation(api.companies.setManufacturerDocStorage);
}

/** AeroGap-admin-only: toggle legacy shared-KB / classic storage for compliance standards per company. */
export function useSetStandardsStorage() {
  return useMutation(api.companies.setStandardsStorage);
}

/** Company-admin: record the per-company license attestation before registering standards. */
export function useRecordStandardsAttestation() {
  return useMutation(api.companies.recordStandardsAttestation);
}

export function useProject(projectId: string | undefined) {
  return useQuery(api.projects.get, projectId ? { projectId: projectId as Id<"projects"> } : 'skip');
}

export function useCreateProject() {
  const create = useMutation(api.projects.create);
  return useCallback(
    async (...args: Parameters<typeof create>) => {
      const result = await create(...args);
      track(ANALYTICS_EVENTS.PROJECT_CREATED);
      return result;
    },
    [create],
  );
}

export function useUpdateProject() {
  return useMutation(api.projects.update);
}

export function useDeleteProject() {
  return useMutation(api.projects.remove);
}

// --- Assessments --------------------------------------------------------
export function useAssessments(projectId: string | undefined) {
  return useQuery(api.assessments.listByProject, projectId ? { projectId: projectId as Id<"projects"> } : 'skip');
}

export function useAddAssessment() {
  return useMutation(api.assessments.add);
}

export function useRemoveAssessment() {
  return useMutation(api.assessments.remove);
}

// --- Entity Profiles -----------------------------------------------------
export function useEntityProfile(projectId: string | undefined) {
  return useQuery(
    api.entityProfiles.getByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useUpsertEntityProfile() {
  return useMutation(api.entityProfiles.upsert);
}

export function useImportEntityProfileFromAssessment() {
  return useMutation(api.entityProfiles.importFromAssessment);
}

export function useEntityProfileByCompany(companyId: string | undefined) {
  return useQuery(
    api.entityProfiles.getByCompany,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip",
  );
}

export function useUpsertEntityProfileByCompany() {
  return useMutation(api.entityProfiles.upsertByCompany);
}

// --- Certificate profiles (Phase A/B normalization) ----------------------
export function useCertificateProfilesByProject(projectId: string | undefined) {
  return useQuery(
    api.certificateProfiles.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useResolvedCertificateProfile(projectId: string | undefined, legacyProfileId?: string) {
  return useQuery(
    api.certificateProfiles.resolveForProject,
    projectId ? { projectId: projectId as Id<"projects">, legacyProfileId: legacyProfileId as any } : "skip",
  );
}

export function useObligationDefinitionsByProfile(profileCode: string | undefined) {
  return useQuery(
    api.certificateProfiles.listObligationDefinitionsByProfile,
    profileCode ? { profileCode } : "skip",
  );
}

// --- Structured ratings/capabilities -------------------------------------
export function useClassRatingsByProject(projectId: string | undefined) {
  return useQuery(
    api.entityClassRatings.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useClassRatingsByCompany(companyId: string | undefined) {
  return useQuery(
    api.entityClassRatings.listByCompany,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip",
  );
}

export function useUpsertClassRating() {
  return useMutation(api.entityClassRatings.upsert);
}

export function useRemoveClassRating() {
  return useMutation(api.entityClassRatings.remove);
}

export function useBulkUpsertClassRatings() {
  return useMutation(api.entityClassRatings.bulkUpsert);
}

export function useCapabilityListByProject(projectId: string | undefined) {
  return useQuery(
    api.entityCapabilityList.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

/** Thin alias used by contextual reviewers. */
export function useEntityCapabilityList(projectId: string | undefined) {
  return useCapabilityListByProject(projectId);
}

export function useCapabilityListByCompany(companyId: string | undefined) {
  return useQuery(
    api.entityCapabilityList.listByCompany,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip",
  );
}

export function useAddCapabilityItem() {
  return useMutation(api.entityCapabilityList.add);
}

export function useUpdateCapabilityItem() {
  return useMutation(api.entityCapabilityList.update);
}

export function useRemoveCapabilityItem() {
  return useMutation(api.entityCapabilityList.remove);
}

export function useBulkUpsertCapabilityItems() {
  return useMutation(api.entityCapabilityList.bulkUpsert);
}

export function useOpSpecsByCompany(companyId: string | undefined) {
  return useQuery(
    api.entityOpSpecs.listByCompany,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip",
  );
}

export function useOpSpecsByProject(projectId: string | undefined) {
  return useQuery(
    api.entityOpSpecs.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

/** Thin alias used by contextual reviewers. */
export function useEntityOpSpecs(projectId: string | undefined) {
  return useOpSpecsByProject(projectId);
}

export function useUpsertOpSpec() {
  return useMutation(api.entityOpSpecs.addOrUpdate);
}

export function useRemoveOpSpec() {
  return useMutation(api.entityOpSpecs.remove);
}

export function useLimitedRatingsByCompany(companyId: string | undefined) {
  return useQuery(
    api.entityLimitedRatings.listByCompany,
    companyId ? { companyId: companyId as Id<"companies"> } : "skip",
  );
}

export function useLimitedRatingsByProject(projectId: string | undefined) {
  return useQuery(
    api.entityLimitedRatings.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useAddLimitedRating() {
  return useMutation(api.entityLimitedRatings.add);
}

export function useUpdateLimitedRating() {
  return useMutation(api.entityLimitedRatings.update);
}

export function useRemoveLimitedRating() {
  return useMutation(api.entityLimitedRatings.remove);
}

// --- Documents ----------------------------------------------------------
export function useDocument(documentId: string | undefined) {
  return useQuery(
    api.documents.get,
    documentId ? { documentId: documentId as Id<'documents'> } : 'skip'
  );
}

export function useDocumentFileUrl(documentId: string | undefined) {
  return useQuery(
    api.documents.getFileUrl,
    documentId ? { documentId: documentId as Id<'documents'> } : 'skip'
  );
}

export function useDocuments(projectId: string | undefined, category?: string) {
  return useQuery(
    api.documents.listByProject,
    projectId ? { projectId: projectId as Id<"projects">, category } : 'skip'
  );
}

/**
 * Lightweight document metadata (no extractedText payloads — listByProject rows
 * can carry ~1 MiB of inline text each). Use for pickers, name lookups, and
 * "has readable text" checks; resolve full text per-document on demand.
 */
export function useDocumentIndexMeta(projectId: string | undefined) {
  return useQuery(
    api.documents.listIndexMetaByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

/**
 * Cursor-paginated documents for human-scrolled lists (e.g. ManualManagement). Returns
 * { results, status, loadMore, isLoading } from Convex usePaginatedQuery — only a page of
 * rows is read at a time. Use useDocuments for full-array consumers (AI/processing views).
 */
export function useDocumentsPaginated(
  projectId: string | undefined,
  category?: string,
  initialNumItems = 50,
) {
  return usePaginatedQuery(
    api.documents.pageByProject,
    projectId ? { projectId: projectId as Id<"projects">, category } : 'skip',
    { initialNumItems },
  );
}

export function useDocumentsByProjectAndFolder(
  projectId: string | undefined,
  category?: string,
  folderId?: string | null,
) {
  return useQuery(
    api.documents.listByProjectAndFolder,
    projectId
      ? {
          projectId: projectId as Id<"projects">,
          category,
          ...(folderId !== undefined ? { folderId: folderId as any } : {}),
        }
      : 'skip'
  );
}

export function useDocumentsByCompany(companyId: string | undefined, category?: string) {
  return useQuery(
    api.documents.listByCompany,
    companyId ? { companyId: companyId as Id<'companies'>, category } : 'skip'
  );
}

export function useMergedEntityRevisionDocs(projectId: string | undefined) {
  const companyId = useComplianceScopeCompanyId();
  const projectEntity = useDocuments(projectId, 'entity') as any[] | undefined;
  const companyEntity = useDocumentsByCompany(companyId, 'entity') as any[] | undefined;
  return useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const doc of [...(projectEntity || []), ...(companyEntity || [])]) {
      const key = doc?._id ? String(doc._id) : String(doc?.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(doc);
    }
    return out;
  }, [projectEntity, companyEntity]);
}

export function useAddDocument() {
  return useMutation(api.documents.add);
}

export function useMoveDocumentToFolder() {
  return useMutation(api.documents.moveToFolder);
}

export function useUpdateDocumentExtractedText() {
  return useMutation(api.documents.updateExtractedText);
}

export function useUpdateDocumentBinaryStorage() {
  return useMutation(api.documents.updateBinaryStorage);
}

export function useRemoveDocument() {
  return useMutation(api.documents.remove);
}

export function useClearDocuments() {
  return useMutation(api.documents.clear);
}

export function useUpdateDocumentCategory() {
  return useMutation(api.documents.updateCategory);
}

export function useReindexOneDocument() {
  return useAction(api.documentChunks.reindexOne);
}

// --- Analyses -----------------------------------------------------------
/** List of analysis summaries (no findings/recommendations). Use useAnalysis(id) for full detail. */
export function useAnalyses(projectId: string | undefined) {
  return useQuery(api.analyses.listByProject, projectId ? { projectId: projectId as Id<"projects"> } : 'skip');
}

/** Full analysis including findings, recommendations, compliance. Use when viewing analysis detail. */
export function useAnalysis(analysisId: string | undefined) {
  return useQuery(
    api.analyses.get,
    analysisId ? { analysisId: analysisId as Id<'analyses'> } : 'skip'
  );
}

export function useAddAnalysis() {
  return useMutation(api.analyses.add);
}

// --- Simulation Results -------------------------------------------------
/** List of run summaries (no messages). Use useSimulationResult(id) for full run with messages. */
export function useSimulationResults(projectId: string | undefined) {
  return useQuery(api.simulationResults.listByProject, projectId ? { projectId: projectId as Id<"projects"> } : 'skip');
}

/** Search run summaries by run metadata and transcript history. */
export function useSearchSimulationResults(projectId: string | undefined, searchText: string, limit = 100) {
  return useQuery(
    api.simulationResults.searchByProject,
    projectId ? { projectId: projectId as Id<"projects">, searchText, limit } : 'skip'
  );
}

/** Full simulation result including messages. Use when viewing or comparing a run. */
export function useSimulationResult(simulationId: string | undefined) {
  return useQuery(
    api.simulationResults.get,
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
  return useQuery(api.documentRevisions.listByProject, projectId ? { projectId: projectId as Id<"projects"> } : 'skip');
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
    projectId && agentId ? { projectId: projectId as Id<"projects">, agentId } : 'skip'
  );
}

export function useAllProjectAgentDocs(projectId: string | undefined) {
  return useQuery(
    api.projectAgentDocuments.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
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

export function useUpdateProjectAgentDocRegion() {
  return useMutation(api.projectAgentDocuments.updateRegion);
}

// --- Shared Agent Documents (KB Repository) -----------------------------
export function useSharedAgentDocs(agentId?: string, companyId?: string) {
  return useQuery(
    api.sharedAgentDocuments.listByAgent,
    agentId && companyId ? { agentId, companyId: companyId as Id<'companies'> } : 'skip'
  );
}

/** Platform-wide KB only (no per-tenant rows). Prefer useSharedAgentDocsForCompany. */
export function useAllSharedAgentDocs() {
  return useQuery(api.sharedAgentDocuments.listAll);
}

export function useSharedAgentDocsForCompany(companyId: string | undefined) {
  return useQuery(
    api.sharedAgentDocuments.listForCompany,
    companyId ? { companyId: companyId as Id<'companies'> } : 'skip',
  );
}

/** Shared docs for the given agent ids; requires company scope for tenant + platform overlay. */
export function useSharedAgentDocsByAgents(agentIds: string[], companyId?: string) {
  return useQuery(
    api.sharedAgentDocuments.listByAgents,
    agentIds.length > 0 && companyId
      ? { agentIds, companyId: companyId as Id<'companies'> }
      : 'skip',
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

export function useUpdateSharedAgentDocRegion() {
  return useMutation(api.sharedAgentDocuments.updateRegion);
}

// --- Shared Reference Documents (Admin → Paperwork Review) ----------------
/** Platform-wide reference docs only. Prefer useSharedReferenceDocsForCompany. */
export function useAllSharedReferenceDocs() {
  return useQuery(api.sharedReferenceDocuments.listAll);
}

export function useSharedReferenceDocsForCompany(companyId: string | undefined) {
  return useQuery(
    api.sharedReferenceDocuments.listForCompany,
    companyId ? { companyId: companyId as Id<'companies'> } : 'skip',
  );
}

export function useAllSharedReferenceDocsAdmin() {
  const isAdmin = useIsAdmin();
  return useQuery(api.sharedReferenceDocuments.listAllAdmin, isAdmin ? {} : 'skip');
}

export function useSharedReferenceDocsByType(documentType?: string, companyId?: string) {
  return useQuery(
    api.sharedReferenceDocuments.listByType,
    documentType && companyId
      ? { documentType, companyId: companyId as Id<'companies'> }
      : 'skip',
  );
}

export function useAddSharedReferenceDoc() {
  return useMutation(api.sharedReferenceDocuments.add);
}

/** Upload DCT XML to company shared refs (project must have companyId). */
export function useAddDctXmlFromProject() {
  return useMutation(api.sharedReferenceDocuments.addDctXmlFromProject);
}

export function useRemoveSharedReferenceDoc() {
  return useMutation(api.sharedReferenceDocuments.remove);
}

export function useClearSharedReferenceDocs() {
  return useMutation(api.sharedReferenceDocuments.clearByType);
}

/** Bulk-delete DCT XML shared refs for the project's company (project members allowed). */
export function useClearDctXmlFromProject() {
  return useMutation(api.sharedReferenceDocuments.clearDctXmlFromProject);
}

/** Start background job to delete all DCT XML + parsed library cache (large libraries). */
export function useStartDctBulkDeleteJob() {
  return useMutation(api.sharedReferenceDocuments.startDctBulkDeleteJob);
}

export function useDctBulkDeleteJob(jobId: string | undefined | null) {
  return useQuery(
    api.sharedReferenceDocuments.getDctBulkDeleteJob,
    jobId ? { jobId: jobId as Id<'dctBulkDeleteJobs'> } : 'skip',
  );
}

export function useActiveDctBulkDeleteJobForProject(projectId: string | undefined | null) {
  return useQuery(
    api.sharedReferenceDocuments.getActiveDctBulkDeleteJobForProject,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

// --- Document Reviews (Paperwork Review) ---------------------------------
export function useDocumentReviews(projectId: string | undefined) {
  return useQuery(
    api.documentReviews.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

/** Full review by id. Use when editing or when list only has summary. */
export function useDocumentReview(reviewId: string | undefined) {
  return useQuery(
    api.documentReviews.get,
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
      ? { projectId: projectId as Id<"projects">, underReviewDocumentId: underReviewDocumentId as any }
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
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
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

export function useRemoveInspectionScheduleItems() {
  return useMutation(api.inspectionSchedule.removeItems);
}

export function useNormalizeInspectionScheduleItems() {
  return useMutation(api.inspectionSchedule.normalizeProjectItems);
}

// --- Entity Issues (Problem areas) ---------------------------------------
export function useEntityIssues(projectId: string | undefined, assessmentId?: string) {
  return useQuery(
    api.entityIssues.listByProject,
    projectId ? { projectId: projectId as Id<"projects">, assessmentId } : 'skip'
  );
}

export function useEntityIssuesByStatus(
  projectId: string | undefined,
  status: 'open' | 'in_progress' | 'pending_verification' | 'closed' | 'voided'
) {
  return useQuery(
    api.entityIssues.listByStatus,
    projectId ? { projectId: projectId as Id<"projects">, status } : 'skip'
  );
}

export function useAddEntityIssue() {
  return useMutation(api.entityIssues.add);
}

export function useUpdateEntityIssue() {
  return useMutation(api.entityIssues.update);
}

/** Alias for useUpdateEntityIssue — used for CAR lifecycle field updates. */
export function useUpdateCarFields() {
  return useMutation(api.entityIssues.update);
}

export function useRemoveEntityIssue() {
  return useMutation(api.entityIssues.remove);
}

// --- Manual Sections (Manual Writer) ------------------------------------
export function useManualSections(projectId: string | undefined, manualType?: string) {
  const byType = useQuery(
    api.manualSections.listByProjectAndType,
    projectId && manualType
      ? { projectId: projectId as Id<"projects">, manualType }
      : 'skip'
  );
  const byProject = useQuery(
    api.manualSections.listByProject,
    projectId && !manualType
      ? { projectId: projectId as Id<"projects"> }
      : 'skip'
  );
  return manualType ? byType : byProject;
}

export function useApprovedSectionsByType(manualType: string | undefined, sectionNumber?: string) {
  return useQuery(
    api.manualSections.listApprovedByTypeAndSection,
    manualType ? { manualType, sectionNumber, limit: 5 } : 'skip'
  );
}

export function useApprovedSectionsForExport(projectId: string | undefined, manualType?: string) {
  return useQuery(
    api.manualSections.listApprovedByProject,
    projectId && manualType
      ? { projectId: projectId as Id<"projects">, manualType }
      : 'skip'
  );
}

export function useAddManualSection() {
  return useMutation(api.manualSections.add);
}

export function useUpdateManualSection() {
  return useMutation(api.manualSections.update);
}

export function useRemoveManualSection() {
  return useMutation(api.manualSections.remove);
}

// --- Manuals (Manual Management) ----------------------------------------
export function useManuals(projectId?: string) {
  return useQuery(
    api.manuals.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

export function useAllManualsForEmployee() {
  return useQuery(api.manuals.listAllForEmployee);
}

export function useManualRevisions(manualId?: string) {
  return useQuery(
    api.manuals.listRevisions,
    manualId ? { manualId: manualId as any } : 'skip'
  );
}

export function useManualChangeLogs(revisionId?: string) {
  return useQuery(
    api.manualChangeLogs.listByRevision,
    revisionId ? { revisionId: revisionId as any } : 'skip'
  );
}

export function useCreateManual() {
  return useMutation(api.manuals.create);
}

export function useUpdateManual() {
  return useMutation(api.manuals.update);
}

export function useRemoveManual() {
  return useMutation(api.manuals.remove);
}

export function useCreateManualRevision() {
  return useMutation(api.manuals.createRevision);
}

export function useSubmitManualRevision() {
  return useMutation(api.manuals.submitRevision);
}

export function useResolveManualRevision() {
  return useMutation(api.manuals.resolveRevision);
}

export function useUpdateManualRevision() {
  return useMutation(api.manuals.updateRevision);
}

export function useRemoveManualRevision() {
  return useMutation(api.manuals.removeRevision);
}

export function useManualRevisionLinksByProject(projectId?: string) {
  return useQuery(
    api.manuals.listRevisionLinksByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

export function useManualRevisionLinksByManual(manualId?: string) {
  return useQuery(
    api.manuals.listRevisionLinksByManual,
    manualId ? { manualId: manualId as any } : 'skip'
  );
}

export function useUpsertManualRevisionLinks() {
  return useMutation(api.manuals.upsertRevisionLinks);
}

export function useAddManualChangeLog() {
  return useMutation(api.manualChangeLogs.add);
}

export function useRemoveManualChangeLog() {
  return useMutation(api.manualChangeLogs.remove);
}

// --- User Settings ------------------------------------------------------
// Skipped until Convex auth settles. AuthGate calls this unconditionally, above its
// own `!isSignedIn` branch, so without the guard every signed-out visitor fires a
// query that can only fail. Matches the `driveConnected` guard alongside it.
export function useUserSettings() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.userSettings.get, isAuthenticated ? {} : 'skip');
}

export function useUpsertUserSettings() {
  return useMutation(api.userSettings.upsert);
}

export function useAllUserSettingsAdmin() {
  return useQuery(api.userSettings.listAllForAdmin);
}

export function useSetLogbookEntitlement() {
  return useMutation(api.userSettings.setLogbookEntitlement);
}

export function useUpdateEnabledAgents() {
  return useMutation(api.userSettings.updateEnabledAgents);
}

export function useUpdateEnabledFrameworks() {
  return useMutation(api.userSettings.updateEnabledFrameworks);
}

export function useUpdateEnabledFeatures() {
  return useMutation(api.userSettings.updateEnabledFeatures);
}

/**
 * Entitlements should follow live scope selection. Staff use `activeCompanyId`;
 * everyone else follows the currently selected project from app state, with
 * settings as fallback while bootstrapping.
 */
function useResolvedCompanyFeaturePolicyForEntitlements():
  | { ready: false }
  | { ready: true; policy: NonNullable<ReturnType<typeof useCompanyFeaturePolicy>> | null } {
  const settings = useUserSettings();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const isStaff = useIsAerogapEmployee();
  const staffCompanyId =
    isStaff && settings?.activeCompanyId
      ? (settings.activeCompanyId as string)
      : undefined;
  const effectiveProjectId = (activeProjectId ?? settings?.activeProjectId ?? undefined) as string | undefined;

  const policyByCompany = useCompanyFeaturePolicy(staffCompanyId);
  const policyByProject = useCompanyFeaturePolicyByProject(
    staffCompanyId ? undefined : (effectiveProjectId as any),
  );

  if (settings === undefined) {
    return { ready: false };
  }

  if (staffCompanyId) {
    if (policyByCompany === undefined) return { ready: false };
    return { ready: true, policy: policyByCompany };
  }

  if (effectiveProjectId) {
    if (policyByProject === undefined) return { ready: false };
    return { ready: true, policy: policyByProject };
  }

  return { ready: true, policy: null };
}

function useEffectiveBillingCompanyId(): Id<'companies'> | undefined {
  const settings = useUserSettings();
  const isStaff = useIsAerogapEmployee();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const staffCompanyId =
    isStaff && settings?.activeCompanyId ? (settings.activeCompanyId as Id<'companies'>) : undefined;
  const effectiveProjectId = (activeProjectId ?? settings?.activeProjectId ?? undefined) as
    | Id<'projects'>
    | undefined;
  const project = useProject(staffCompanyId ? undefined : effectiveProjectId);
  if (staffCompanyId) return staffCompanyId;
  return project?.companyId ?? undefined;
}

export function useBillingEntitlements() {
  const companyId = useEffectiveBillingCompanyId();
  return useQuery(api.billing.getMyEntitlements, { companyId });
}

export function useBillingPlans() {
  return useQuery(api.billing.listPlans, {});
}

export function useBillingOverview(ownerType: 'user' | 'company', ownerId: string | undefined) {
  return useQuery(
    api.billing.getOverview,
    ownerId ? { ownerType, ownerId } : 'skip',
  );
}

export function useBillingInvoices(
  ownerType: 'user' | 'company',
  ownerId: string | undefined,
  limit = 12,
) {
  return useQuery(
    api.billing.listInvoices,
    ownerId ? { ownerType, ownerId, limit } : 'skip',
  );
}

export function useBillingAdminSummary() {
  return useQuery(api.billing.adminListBillingSummary, {});
}

export function useCreateSubscriptionPayment() {
  return useAction(api.billingActions.createSubscriptionPayment);
}

export function useCreateBillingSetupIntent() {
  return useAction(api.billingActions.createSetupIntentForPaymentMethod);
}

export function useChangeSubscriptionPlan() {
  return useAction(api.billingActions.changeSubscriptionPlan);
}

export function useCancelSubscription() {
  return useAction(api.billingActions.cancelSubscription);
}

export function useReactivateSubscription() {
  return useAction(api.billingActions.reactivateSubscription);
}

export function useSyncBillingFromStripe() {
  return useAction(api.billingActions.syncOwnerFromStripe);
}

/**
 * Returns the set of enabled feature keys for the current user.
 * Returns null while loading (optimistic: treat as all-enabled to avoid flash)
 * and when neither layer restricts (unset = all enabled).
 * Company policy acts as a ceiling; per-user toggles further restrict within it.
 */
export function useEnabledFeatures(): Set<string> | null {
  const settings = useUserSettings();
  const resolvedPolicy = useResolvedCompanyFeaturePolicyForEntitlements();
  const billing = useBillingEntitlements();
  const companyId = useEffectiveBillingCompanyId();
  if (settings === undefined || !resolvedPolicy.ready) return null;

  const { policy } = resolvedPolicy;
  const enforcement = billing?.enforcementEnabled === true;
  const inCompanyContext = Boolean(companyId);

  const companyLayer = applyBillingEnforcement(
    policy?.entitlementSource,
    policy?.enabledFeatures,
    policy?.logbookEnabled,
    inCompanyContext ? (billing?.company ?? billing?.effective ?? undefined) : null,
    enforcement,
  );
  const userLayer = applyBillingEnforcement(
    settings?.entitlementSource,
    settings?.enabledFeatures,
    settings?.logbookEnabled,
    billing?.user ?? (!inCompanyContext ? billing?.effective ?? undefined : null),
    enforcement,
  );

  const resolved = intersectEnabledLists(
    companyLayer.enabledFeatures,
    userLayer.enabledFeatures,
  );
  return resolved ? new Set(resolved) : null; // null = all enabled
}

/**
 * Effective auditor agent ids for the current user: company policy ∩ user toggles.
 * Returns null while loading or when neither layer restricts (= all agents).
 */
export function useEnabledAgentIds(): string[] | null {
  const settings = useUserSettings();
  const resolvedPolicy = useResolvedCompanyFeaturePolicyForEntitlements();
  if (settings === undefined || !resolvedPolicy.ready) return null;
  const { policy } = resolvedPolicy;
  return intersectEnabledLists(
    (policy as any)?.enabledAgents,
    (settings as any)?.enabledAgents,
  );
}

/**
 * Effective checklist framework ids for the current user: company policy ∩ user toggles.
 * Returns null while loading or when neither layer restricts (= all frameworks).
 */
export function useEnabledFrameworkIds(): string[] | null {
  const settings = useUserSettings();
  const resolvedPolicy = useResolvedCompanyFeaturePolicyForEntitlements();
  if (settings === undefined || !resolvedPolicy.ready) return null;
  const { policy } = resolvedPolicy;
  return intersectEnabledLists(
    (policy as any)?.enabledFrameworks,
    (settings as any)?.enabledFrameworks,
  );
}

/**
 * Quality command center and compliance dashboard routes: enabled explicitly, or implicitly when any core
 * compliance feature is on the allowlist (avoids hidden hub when `quality-command-center` was never toggled).
 */
export function useIsQualityCommandHubAvailable(): boolean {
  const enabled = useEnabledFeatures();
  if (enabled === null) return true;
  if (enabled.has(FEATURE_KEYS.QUALITY_COMMAND_CENTER)) return true;
  return IMPLICIT_QUALITY_HUB_FEATURE_KEYS.some((k) => enabled.has(k));
}

/**
 * Returns true if the given feature key is enabled for the current user.
 * Returns true while settings are loading (optimistic, avoids sidebar flash)
 * and when no restriction is configured (unset = all enabled).
 */
export function useIsFeatureEnabled(key: string): boolean {
  const enabled = useEnabledFeatures();
  if (enabled === null) return true; // loading or unrestricted → show
  return enabled.has(key);
}

export function useIsLogbookEnabled(): boolean {
  const settings = useUserSettings();
  const resolvedPolicy = useResolvedCompanyFeaturePolicyForEntitlements();
  const billing = useBillingEntitlements();
  const companyId = useEffectiveBillingCompanyId();
  if (settings === undefined) {
    return resolveLogbookEnabled(undefined, undefined, undefined);
  }
  if (!resolvedPolicy.ready) {
    return true;
  }
  const { policy } = resolvedPolicy;
  const enforcement = billing?.enforcementEnabled === true;
  const inCompanyContext = Boolean(companyId);
  const companyLayer = applyBillingEnforcement(
    policy?.entitlementSource,
    policy?.enabledFeatures,
    policy?.logbookEnabled,
    inCompanyContext ? (billing?.company ?? billing?.effective ?? undefined) : null,
    enforcement,
  );
  const userLayer = applyBillingEnforcement(
    settings?.entitlementSource,
    settings?.enabledFeatures,
    settings?.logbookEnabled,
    billing?.user ?? (!inCompanyContext ? billing?.effective ?? undefined : null),
    enforcement,
  );
  return resolveLogbookEnabled(undefined, companyLayer.logbookEnabled, userLayer.logbookEnabled);
}

export function useLogbookEntitlementMode(): 'addon' | 'standalone' | undefined {
  const settings = useUserSettings();
  const resolvedPolicy = useResolvedCompanyFeaturePolicyForEntitlements();
  if (settings === undefined || !resolvedPolicy.ready) {
    return settings?.logbookEntitlementMode === 'addon' || settings?.logbookEntitlementMode === 'standalone'
      ? settings.logbookEntitlementMode
      : undefined;
  }
  const { policy } = resolvedPolicy;
  const mode = policy?.logbookEntitlementMode ?? settings?.logbookEntitlementMode;
  return mode === 'addon' || mode === 'standalone' ? mode : undefined;
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

/** Model for DCT compliance AI traceability (falls back to default if not set). */
export function useDctTraceabilityModel(): string {
  const settings = useUserSettings();
  return resolveModel('dctTraceability', settings);
}

/** Model for DCT document checks (falls back to default if not set). */
export function useDctDocumentCheckModel(): string {
  const settings = useUserSettings();
  return resolveModel('dctDocumentCheck', settings);
}

/** Agent perspective for DCT traceability (falls back to FAA DCT specialist if not set). */
export function useDctTraceabilityAgentId(): string {
  const settings = useUserSettings();
  return settings?.dctTraceabilityAgentId ?? 'faa-dct-traceability';
}

/** Agent perspective for DCT document checks (falls back to FAA DCT specialist if not set). */
export function useDctDocumentCheckAgentId(): string {
  const settings = useUserSettings();
  return settings?.dctDocumentCheckAgentId ?? 'faa-dct-traceability';
}

/** Fetch available Claude models from API. Used by Settings and feature-specific model selectors. */
export function useAvailableClaudeModels() {
  const [models, setModels] = useState<AvailableClaudeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/claude-models');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setModels(data.models ?? []);
    } catch {
      setModels([]);
      setError("Couldn't load the model list.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Kept as an effect deliberately: fetching the model list from /api/claude-models on
  // mount is the canonical "synchronize with an external system" case. The rule fires
  // because refetch flips loading/error synchronously before awaiting, which is the
  // request starting, not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  return { models, loading, error, refetch };
}

// --- File Storage -------------------------------------------------------
export function useGenerateUploadUrl() {
  return useMutation(api.fileActions.generateUploadUrl);
}

export function useDeleteStorage() {
  return useMutation(api.fileActions.deleteStorage);
}

// --- User Management (Admin) --------------------------------------------
export function useUpsertUser() {
  return useMutation(api.users.upsertFromClerk);
}

export function useSetUserRole() {
  return useMutation(api.users.setRole);
}

// --- Aircraft Assets (Logbook Management) --------------------------------
export function useAircraftAssets(projectId: string | undefined) {
  return useQuery(
    api.aircraftAssets.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

export function useAircraftAsset(aircraftId: string | undefined) {
  return useQuery(
    api.aircraftAssets.get,
    aircraftId ? { aircraftId: aircraftId as any } : 'skip'
  );
}

export function useCreateAircraftAsset() {
  return useMutation(api.aircraftAssets.create);
}

export function useUpdateAircraftAsset() {
  return useMutation(api.aircraftAssets.update);
}

export function useRemoveAircraftAsset() {
  return useMutation(api.aircraftAssets.remove);
}

// --- Logbook Entries -----------------------------------------------------
export function useLogbookEntries(projectId: string | undefined, aircraftId?: string) {
  const byAircraft = useQuery(
    api.logbookEntries.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as Id<"projects">, aircraftId: aircraftId as any }
      : 'skip'
  );
  const byProject = useQuery(
    api.logbookEntries.listByProject,
    projectId && !aircraftId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
  return aircraftId ? byAircraft : byProject;
}

export function useLogbookEntry(entryId: string | undefined) {
  return useQuery(
    api.logbookEntries.get,
    entryId ? { entryId: entryId as any } : 'skip'
  );
}

export function useSearchLogbookEntries() {
  return api.logbookEntries.search;
}

export function useAddLogbookEntries() {
  return useMutation(api.logbookEntries.addBatch);
}

export function useUpdateLogbookEntry() {
  return useMutation(api.logbookEntries.update);
}

export function useRemoveLogbookEntry() {
  return useMutation(api.logbookEntries.remove);
}

// --- FAA Form 337 Records ------------------------------------------------
export function useForm337Records(projectId: string | undefined) {
  return useQuery(
    api.form337Records.listByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useAddForm337Record() {
  return useMutation(api.form337Records.add);
}

export function useUpdateForm337Record() {
  return useMutation(api.form337Records.update);
}

export function useRemoveForm337Record() {
  return useMutation(api.form337Records.remove);
}

// --- Aircraft Modifications ------------------------------------------------
/** Graph payload for the Modifications tab: `{ mods, edges }` for one aircraft. */
export function useAircraftModifications(aircraftId: string | undefined) {
  return useQuery(
    api.aircraftModifications.listByAircraft,
    aircraftId ? { aircraftId: aircraftId as any } : 'skip'
  );
}

export function useAddAircraftModifications() {
  return useMutation(api.aircraftModifications.addBatch);
}

export function useUpdateAircraftModification() {
  return useMutation(api.aircraftModifications.update);
}

export function useRemoveAircraftModification() {
  return useMutation(api.aircraftModifications.remove);
}

export function useAddModificationEdge() {
  return useMutation(api.aircraftModifications.addEdge);
}

export function useUpdateModificationEdge() {
  return useMutation(api.aircraftModifications.updateEdge);
}

export function useRemoveModificationEdge() {
  return useMutation(api.aircraftModifications.removeEdge);
}

// --- Logbook Draft Entries ------------------------------------------------
export function useLogbookDraftEntries(
  projectId: string | undefined,
  aircraftId?: string,
  sourceDocumentId?: string
) {
  const queryArgs =
    projectId && aircraftId
      ? sourceDocumentId
        ? {
            projectId: projectId as Id<"projects">,
            aircraftId: aircraftId as any,
            sourceDocumentId: sourceDocumentId as any,
          }
        : {
            projectId: projectId as Id<"projects">,
            aircraftId: aircraftId as any,
          }
      : 'skip';

  return useQuery(
    api.logbookDraftEntries.listByAircraft,
    queryArgs
  );
}

export function useAddLogbookDraftEntries() {
  return useMutation(api.logbookDraftEntries.addBatch);
}

export function useRemoveLogbookDraftEntriesBySourceDocument() {
  return useMutation(api.logbookDraftEntries.removeBySourceDocument);
}

export function useRemoveSelectedLogbookDraftEntries() {
  return useMutation(api.logbookDraftEntries.removeSelected);
}

export function useImportSelectedLogbookDraftEntries() {
  return useMutation(api.logbookDraftEntries.importSelected);
}

// --- Aircraft Components -------------------------------------------------
export function useAircraftComponents(projectId: string | undefined, aircraftId?: string, statusFilter?: string) {
  return useQuery(
    api.aircraftComponents.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as Id<"projects">, aircraftId: aircraftId as any, statusFilter }
      : 'skip'
  );
}

export function useAddAircraftComponent() {
  return useMutation(api.aircraftComponents.add);
}

export function useUpdateAircraftComponent() {
  return useMutation(api.aircraftComponents.update);
}

export function useRemoveAircraftComponent() {
  return useMutation(api.aircraftComponents.remove);
}

// --- Compliance Rules ----------------------------------------------------
export function useComplianceRules(regulatoryPack?: string) {
  const byPack = useQuery(
    api.complianceRules.listByPack,
    regulatoryPack ? { regulatoryPack } : 'skip'
  );
  const all = useQuery(
    api.complianceRules.listAll,
    regulatoryPack ? 'skip' : {}
  );
  return regulatoryPack ? byPack : all;
}

export function useSeedComplianceRules() {
  return useMutation(api.complianceRules.seedPart43And91);
}

export function useSeedRulePack() {
  return useMutation(api.complianceRules.seedRulePack);
}

// --- Compliance Findings -------------------------------------------------
export function useComplianceFindings(projectId: string | undefined, aircraftId?: string, statusFilter?: string) {
  const byAircraft = useQuery(
    api.complianceFindings.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as Id<"projects">, aircraftId: aircraftId as any, statusFilter }
      : 'skip'
  );
  const byProject = useQuery(
    api.complianceFindings.listByProject,
    projectId && !aircraftId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
  return aircraftId ? byAircraft : byProject;
}

export function useAddComplianceFindings() {
  return useMutation(api.complianceFindings.addBatch);
}

export function useUpdateComplianceFindingStatus() {
  return useMutation(api.complianceFindings.updateStatus);
}

export function useConvertFindingToIssue() {
  return useMutation(api.complianceFindings.convertToIssue);
}

// --- Audit Checklists ----------------------------------------------------
export function useChecklistRuns(projectId: string | undefined) {
  return useQuery(
    api.auditChecklists.listRunsByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useChecklistItems(runId: string | undefined) {
  return useQuery(
    api.auditChecklists.listItemsByRun,
    runId ? { checklistRunId: runId as any } : "skip"
  );
}

export function useCreateChecklistRunFromTemplate() {
  return useMutation(api.auditChecklists.createRunFromTemplate);
}

export function useCreateChecklistRunFromTemplateAndLibrary() {
  return useMutation(api.auditChecklists.createRunFromTemplateAndLibrary);
}

export function useCreateChecklistRunFromSelectedDocs() {
  return useMutation(api.auditChecklists.createRunFromSelectedDocuments);
}

export function useChecklistCustomTemplateItems(
  projectId: string | undefined,
  framework: string | undefined,
  subtypeId?: string
) {
  return useQuery(
    api.auditChecklists.listCustomTemplateItems,
    projectId && framework ? { projectId: projectId as Id<"projects">, framework, subtypeId } : "skip"
  );
}

export function useSaveChecklistCustomTemplateItems() {
  return useMutation(api.auditChecklists.saveCustomTemplateItems);
}

export function useUpdateChecklistRun() {
  return useMutation(api.auditChecklists.updateRun);
}

export function useDeleteChecklistRun() {
  return useMutation(api.auditChecklists.deleteRun);
}

export function useUpdateChecklistItem() {
  return useMutation(api.auditChecklists.updateItem);
}

export function useDeleteChecklistItem() {
  return useMutation(api.auditChecklists.deleteItem);
}

export function useAddChecklistManualItem() {
  return useMutation(api.auditChecklists.addManualItem);
}

export function useEscalateChecklistItemToIssue() {
  return useMutation(api.auditChecklists.escalateItemToIssue);
}

export function useChecklistItemComments(checklistRunId: string | undefined) {
  return useQuery(
    api.auditChecklists.listCommentsByRun,
    checklistRunId ? { checklistRunId: checklistRunId as any } : "skip",
  );
}

export function useAddChecklistItemComment() {
  return useMutation(api.auditChecklists.addItemComment);
}

export function useDeleteChecklistItemComment() {
  return useMutation(api.auditChecklists.deleteItemComment);
}

export function useUpdateChecklistSectionOrder() {
  return useMutation(api.auditChecklists.updateSectionOrder);
}

export function useRenameChecklistSection() {
  return useMutation(api.auditChecklists.renameSection);
}

export function useMoveItemToSection() {
  return useMutation(api.auditChecklists.moveItemToSection);
}

// --- Checklist series / occurrences (audit prep history) ----------------
export function useChecklistSeriesList(projectId: string | undefined) {
  return useQuery(
    api.checklistSeries.listSeriesByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useChecklistOccurrences(seriesId: string | undefined) {
  return useQuery(
    api.checklistSeries.listOccurrencesBySeries,
    seriesId ? { seriesId: seriesId as any } : "skip",
  );
}

export function useChecklistSeriesForRun(runId: string | undefined) {
  return useQuery(
    api.checklistSeries.getSeriesForRun,
    runId ? { checklistRunId: runId as any } : "skip",
  );
}

export function useChecklistOccurrenceForRun(runId: string | undefined) {
  return useQuery(
    api.checklistSeries.getOccurrenceForRun,
    runId ? { checklistRunId: runId as any } : "skip",
  );
}

export function useCreateSeriesAndLinkRun() {
  return useMutation(api.checklistSeries.createSeriesAndLinkRun);
}

export function useCloseChecklistOccurrence() {
  return useMutation(api.checklistSeries.closeOccurrence);
}

export function useStartNextChecklistCycle() {
  return useMutation(api.checklistSeries.startNextCycle);
}

export function useUpdateChecklistSeries() {
  return useMutation(api.checklistSeries.updateSeries);
}

export function useUpdateOpenOccurrencePlannedDue() {
  return useMutation(api.checklistSeries.updateOpenOccurrencePlannedDue);
}

// --- Analytics ----------------------------------------------------------
export function useProjectStats(projectId: string | undefined) {
  return useQuery(
    api.analytics.getProjectStats,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

export function useComplianceTrend(projectId: string | undefined) {
  return useQuery(
    api.analytics.getComplianceTrend,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip'
  );
}

export function useCrossProjectSummary() {
  return useQuery(api.analytics.getCrossProjectSummary, {});
}

// --- Product events ---------------------------------------------------------
/** Logs a lightweight analytics/KPI event (may be called without auth for public landing). */
export function useLogProductEvent() {
  return useMutation(api.productEvents.logProductEvent);
}

// --- Avianis integration ----------------------------------------------------
export function useAvianisStatus() {
  return useQuery(api.avianisIntegration.getStatus, {});
}

export function useFleetAircraft(projectId: string | undefined) {
  return useQuery(
    api.avianisIntegration.listAircraftForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip',
  );
}

export function useFleetDiscrepancies(projectId: string | undefined) {
  return useQuery(
    api.avianisIntegration.listDiscrepanciesForProject,
    projectId ? { projectId: projectId as Id<"projects"> } : 'skip',
  );
}

export function useTestAvianisConnection() {
  return useAction(api.avianisIntegration.testConnection);
}

export function useSyncAvianis() {
  return useAction(api.avianisIntegration.syncAll);
}

export function useCreateManualDiscrepancy() {
  return useMutation(api.avianisIntegration.createManualDiscrepancy);
}

/**
 * Research a discrepancy: gather context via Convex queries, run the Claude
 * call CLIENT-side through the /api/claude proxy (so Convex doesn't bill
 * action compute for the model's response time), then persist via the
 * `saveResearch` mutation, which re-validates server-side.
 */
export function useResearchDiscrepancy() {
  const convex = useConvex();
  return useCallback(
    async ({ discrepancyId }: { discrepancyId: string }) => {
      const { runDiscrepancyResearch, RESEARCH_SEARCH_TOP_K } = await import(
        '../services/discrepancyResearchService'
      );
      const discrepancy = await convex.query(api.avianisIntegration.getDiscrepancy, {
        discrepancyId: discrepancyId as any,
      });
      if (!discrepancy) throw new Error('Discrepancy not found');
      const aircraftList = await convex.query(
        api.avianisIntegration.listAircraftForProject,
        { projectId: discrepancy.projectId },
      );
      const aircraft = (aircraftList as any[]).find((a) => a._id === discrepancy.aircraftId);
      if (!aircraft) throw new Error('Aircraft not found for discrepancy');

      // Scope manuals to this aircraft (listByAircraft already includes fleet-wide pubs).
      let scopedDocIds: string[];
      try {
        const pubs = (await convex.query(api.technicalPublications.listByAircraft, {
          projectId: discrepancy.projectId,
          aircraftId: discrepancy.aircraftId,
        })) as Array<{ documentId: string }>;
        scopedDocIds = pubs.map((p) => p.documentId);
      } catch {
        // If the project isn't attached to a company, listByAircraft returns []; just
        // fall back to the project-wide search (no documentIds filter).
        scopedDocIds = [];
      }

      const searchQuery = [
        discrepancy.description,
        discrepancy.ataChapter,
        discrepancy.melItem,
        (discrepancy.partNumbers ?? []).join(' '),
        aircraft.make,
        aircraft.model,
      ]
        .filter(Boolean)
        .join(' ');

      const searchResult = (await searchProjectDocuments(convex, {
        projectId: String(discrepancy.projectId),
        query: searchQuery,
        documentIds: scopedDocIds.length > 0 ? (scopedDocIds as string[]) : undefined,
        driveDocumentIds: scopedDocIds.length > 0 ? (scopedDocIds as string[]) : undefined,
        topK: RESEARCH_SEARCH_TOP_K,
      })) as {
        chunks: Array<{
          documentId: string;
          docName: string;
          chunkIndex: number;
          text: string;
          score: number;
        }>;
      };

      const raw = await runDiscrepancyResearch({
        aircraft: {
          tailNumber: aircraft.tailNumber,
          make: aircraft.make,
          model: aircraft.model,
          serial: aircraft.serial,
          currentTotalTime: aircraft.currentTotalTime,
          currentTotalCycles: aircraft.currentTotalCycles,
        },
        discrepancy: {
          description: discrepancy.description,
          ataChapter: discrepancy.ataChapter,
          melItem: discrepancy.melItem,
          partNumbers: discrepancy.partNumbers,
          location: discrepancy.location,
          category: discrepancy.category,
          status: discrepancy.status,
          discoveredAt: discrepancy.discoveredAt,
        },
        chunks: searchResult.chunks,
      });

      // saveResearch coerces + persists and returns the canonical result.
      return await convex.mutation(api.discrepancyResearch.saveResearch, {
        discrepancyId: discrepancyId as any,
        research: raw,
      });
    },
    [convex],
  );
}

export function useAcceptResearchAsLogbookDraft() {
  return useAction(api.discrepancyResearch.acceptResearchAsLogbookDraft);
}

// ── Checklist Evidence ────────────────────────────────────────────────────────

export function useListChecklistEvidence(checklistRunId: string | null | undefined) {
  return useQuery(
    api.auditChecklists.listEvidenceByRun,
    checklistRunId ? { checklistRunId: checklistRunId as Id<"auditChecklistRuns"> } : "skip"
  );
}

export function useGenerateEvidenceUploadUrl() {
  return useMutation(api.auditChecklists.generateEvidenceUploadUrl);
}

export function useSaveEvidenceFile() {
  return useMutation(api.auditChecklists.saveEvidenceFile);
}

export function useDeleteEvidenceFile() {
  return useMutation(api.auditChecklists.deleteEvidenceFile);
}

export function useUpdateItemRequiresEvidence() {
  return useMutation(api.auditChecklists.updateItemRequiresEvidence);
}

// ── Checklist Approval workflow ───────────────────────────────────────────────

export function useSetApprovalRequired() {
  return useMutation(api.auditChecklists.setApprovalRequired);
}

export function useRequestApproval() {
  return useMutation(api.auditChecklists.requestApproval);
}

export function useResolveApproval() {
  return useMutation(api.auditChecklists.resolveApproval);
}

// ── Conditional logic ─────────────────────────────────────────────────────────

export function useSetItemCondition() {
  return useMutation(api.auditChecklists.setItemCondition);
}

export * from './useDctConvexData';
export * from './useRosterConvexData';
export * from './useLibraryConvexData';
