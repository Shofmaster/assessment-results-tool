import { useState, useCallback, useEffect, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { useQuery } from './useConvexQueryNoThrow';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import { resolveModel } from '../services/llmConfig';
import { resolveEnabledList, resolveLogbookEnabled } from '../utils/entitlementResolution';

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
  return useQuery((api as any).companies.listSummariesForStaff, isStaff ? {} : 'skip');
}

export function useMyAdminCompanies() {
  return useQuery((api as any).companies.listMyAdminCompanies, {});
}

export function useLookupUserByEmailForCompany(companyId: string | undefined, email: string) {
  const trimmed = email.trim();
  return useQuery(
    (api as any).users.lookupByEmailForCompanyAdmin,
    companyId && trimmed ? { companyId: companyId as any, email: trimmed } : 'skip',
  );
}

export function useListPlatformStaffForSupportPicker(companyId: string | undefined) {
  return useQuery(
    (api as any).users.listPlatformStaffForSupportPicker,
    companyId ? { companyId: companyId as any } : 'skip',
  );
}

/** Full user directory; Convex allows platform staff — only AdminPanel mounts this (admin-only route). */
export function useAllUsers() {
  const isAdmin = useIsAdmin();
  return useQuery(api.users.listAll, isAdmin ? {} : 'skip');
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
  return useQuery((api as any).companies.listForCurrentUser);
}

export function useAllCompaniesAdmin() {
  return useQuery((api as any).companies.listAll);
}

export function useCreateCompany() {
  return useMutation((api as any).companies.create);
}

export function useUpdateCompany() {
  return useMutation((api as any).companies.update);
}

export function useCompanyMembers(companyId: string | undefined) {
  return useQuery(
    (api as any).companies.listMembers,
    companyId ? { companyId: companyId as any } : "skip"
  );
}

export function useAddCompanyMember() {
  return useMutation((api as any).companies.addMember);
}

export function useRemoveCompanyMember() {
  return useMutation((api as any).companies.removeMember);
}

export function useCompanySupportAssignments(companyId: string | undefined) {
  return useQuery(
    (api as any).companies.listSupportAssignments,
    companyId ? { companyId: companyId as any } : "skip"
  );
}

export function useAssignCompanySupportUser() {
  return useMutation((api as any).companies.assignSupportUser);
}

export function useRemoveCompanySupportAssignment() {
  return useMutation((api as any).companies.removeSupportAssignment);
}

export function useCompanyFeaturePolicyByProject(projectId: string | undefined) {
  return useQuery(
    (api as any).companies.getFeaturePolicyByProject,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useCompanyFeaturePolicy(companyId: string | undefined) {
  return useQuery(
    (api as any).companies.getFeaturePolicy,
    companyId ? { companyId: companyId as any } : "skip"
  );
}

export function useUpsertCompanyFeaturePolicy() {
  return useMutation((api as any).companies.upsertFeaturePolicy);
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

// --- Entity Profiles -----------------------------------------------------
export function useEntityProfile(projectId: string | undefined) {
  return useQuery(
    (api as any).entityProfiles.getByProject,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useUpsertEntityProfile() {
  return useMutation((api as any).entityProfiles.upsert);
}

export function useImportEntityProfileFromAssessment() {
  return useMutation((api as any).entityProfiles.importFromAssessment);
}

// --- Documents ----------------------------------------------------------
export function useDocuments(projectId: string | undefined, category?: string) {
  return useQuery(
    api.documents.listByProject,
    projectId ? { projectId: projectId as any, category } : 'skip'
  );
}

export function useDocumentsByCompany(companyId: string | undefined, category?: string) {
  return useQuery(
    api.documents.listByCompany,
    companyId ? { companyId: companyId as Id<'companies'>, category } : 'skip'
  );
}

export function useAddDocument() {
  return useMutation((api as any).documents.add);
}

export function useUpdateDocumentExtractedText() {
  return useMutation((api as any).documents.updateExtractedText);
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

/** Search run summaries by run metadata and transcript history. */
export function useSearchSimulationResults(projectId: string | undefined, searchText: string, limit = 100) {
  return useQuery(
    (api as any).simulationResults.searchByProject,
    projectId ? { projectId: projectId as any, searchText, limit } : 'skip'
  );
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

export function useRemoveInspectionScheduleItems() {
  return useMutation(api.inspectionSchedule.removeItems);
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

export function useEntityIssuesByStatus(
  projectId: string | undefined,
  status: 'open' | 'in_progress' | 'pending_verification' | 'closed' | 'voided'
) {
  return useQuery(
    (api as any).entityIssues.listByStatus,
    projectId ? { projectId: projectId as any, status } : 'skip'
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

// --- Roster ---------------------------------------------------------------
export function useRosterRequirementTypes(projectId: string | undefined) {
  return useQuery(
    (api as any).roster.listRequirementTypes,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useAddRosterRequirementType() {
  return useMutation((api as any).roster.addRequirementType);
}

export function useUpdateRosterRequirementType() {
  return useMutation((api as any).roster.updateRequirementType);
}

export function useRemoveRosterRequirementType() {
  return useMutation((api as any).roster.removeRequirementType);
}

export function useRosterPersonnel(projectId: string | undefined) {
  return useQuery(
    (api as any).roster.listPersonnel,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useAddRosterPerson() {
  return useMutation((api as any).roster.addPerson);
}

export function useUpdateRosterPerson() {
  return useMutation((api as any).roster.updatePerson);
}

export function useRemoveRosterPerson() {
  return useMutation((api as any).roster.removePerson);
}

export function useRosterAssignments(projectId: string | undefined) {
  return useQuery(
    (api as any).roster.listAssignments,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useAddRosterAssignment() {
  return useMutation((api as any).roster.addAssignment);
}

export function useUpdateRosterAssignment() {
  return useMutation((api as any).roster.updateAssignment);
}

export function useRemoveRosterAssignment() {
  return useMutation((api as any).roster.removeAssignment);
}

export function useRosterDashboard(projectId: string | undefined, capability?: string) {
  return useQuery(
    (api as any).roster.getDashboard,
    projectId ? { projectId: projectId as any, capability } : "skip"
  );
}

// --- Manual Sections (Manual Writer) ------------------------------------
export function useManualSections(projectId: string | undefined, manualType?: string) {
  const byType = useQuery(
    api.manualSections.listByProjectAndType,
    projectId && manualType
      ? { projectId: projectId as any, manualType }
      : 'skip'
  );
  const byProject = useQuery(
    api.manualSections.listByProject,
    projectId && !manualType
      ? { projectId: projectId as any }
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
    (api as any).manualSections.listApprovedByProject,
    projectId && manualType
      ? { projectId: projectId as any, manualType }
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
    (api as any).manuals.listByProject,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

export function useAllManualsForEmployee() {
  return useQuery((api as any).manuals.listAllForEmployee);
}

export function useManualRevisions(manualId?: string) {
  return useQuery(
    (api as any).manuals.listRevisions,
    manualId ? { manualId: manualId as any } : 'skip'
  );
}

export function useManualChangeLogs(revisionId?: string) {
  return useQuery(
    (api as any).manualChangeLogs.listByRevision,
    revisionId ? { revisionId: revisionId as any } : 'skip'
  );
}

export function useCreateManual() {
  return useMutation((api as any).manuals.create);
}

export function useUpdateManual() {
  return useMutation((api as any).manuals.update);
}

export function useRemoveManual() {
  return useMutation((api as any).manuals.remove);
}

export function useCreateManualRevision() {
  return useMutation((api as any).manuals.createRevision);
}

export function useSubmitManualRevision() {
  return useMutation((api as any).manuals.submitRevision);
}

export function useResolveManualRevision() {
  return useMutation((api as any).manuals.resolveRevision);
}

export function useAddManualChangeLog() {
  return useMutation((api as any).manualChangeLogs.add);
}

export function useRemoveManualChangeLog() {
  return useMutation((api as any).manualChangeLogs.remove);
}

// --- User Settings ------------------------------------------------------
export function useUserSettings() {
  return useQuery(api.userSettings.get);
}

export function useUpsertUserSettings() {
  return useMutation(api.userSettings.upsert);
}

export function useAllUserSettingsAdmin() {
  return useQuery((api as any).userSettings.listAllForAdmin);
}

export function useSetLogbookEntitlement() {
  return useMutation((api as any).userSettings.setLogbookEntitlement);
}

export function useUpdateEnabledAgents() {
  return useMutation((api as any).userSettings.updateEnabledAgents);
}

export function useUpdateEnabledFrameworks() {
  return useMutation((api as any).userSettings.updateEnabledFrameworks);
}

export function useUpdateEnabledFeatures() {
  return useMutation((api as any).userSettings.updateEnabledFeatures);
}

/**
 * Returns the set of enabled feature keys for the current user.
 * Returns null while loading (optimistic: treat as all-enabled to avoid flash).
 * Returns an empty Set when the user has no features configured (default = none enabled).
 */
export function useEnabledFeatures(): Set<string> | null {
  const settings = useUserSettings();
  const policy = useCompanyFeaturePolicyByProject(settings?.activeProjectId as any);
  if (settings === undefined) return null; // still loading
  if (settings?.activeProjectId && policy === undefined) return null;

  const resolved = resolveEnabledList(undefined, policy?.enabledFeatures, settings?.enabledFeatures);
  return resolved ? new Set(resolved) : null; // null = all enabled
}

/**
 * Returns true if the given feature key is enabled for the current user.
 * Returns true while settings are loading (optimistic, avoids sidebar flash).
 * Returns false when no features are configured (default-deny).
 */
export function useIsFeatureEnabled(key: string): boolean {
  const enabled = useEnabledFeatures();
  if (enabled === null) return true; // loading or unrestricted → show
  return enabled.has(key);
}

export function useIsLogbookEnabled(): boolean {
  const settings = useUserSettings();
  const policy = useCompanyFeaturePolicyByProject(settings?.activeProjectId as any);
  if (settings?.activeProjectId && policy === undefined) {
    return true;
  }
  return resolveLogbookEnabled(undefined, policy?.logbookEnabled, settings?.logbookEnabled);
}

export function useLogbookEntitlementMode(): 'addon' | 'standalone' | undefined {
  const settings = useUserSettings();
  const policy = useCompanyFeaturePolicyByProject(settings?.activeProjectId as any);
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

// --- Aircraft Assets (Logbook Management) --------------------------------
export function useAircraftAssets(projectId: string | undefined) {
  return useQuery(
    (api as any).aircraftAssets.listByProject,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

export function useAircraftAsset(aircraftId: string | undefined) {
  return useQuery(
    (api as any).aircraftAssets.get,
    aircraftId ? { aircraftId: aircraftId as any } : 'skip'
  );
}

export function useCreateAircraftAsset() {
  return useMutation((api as any).aircraftAssets.create);
}

export function useUpdateAircraftAsset() {
  return useMutation((api as any).aircraftAssets.update);
}

export function useRemoveAircraftAsset() {
  return useMutation((api as any).aircraftAssets.remove);
}

// --- Logbook Entries -----------------------------------------------------
export function useLogbookEntries(projectId: string | undefined, aircraftId?: string) {
  const byAircraft = useQuery(
    (api as any).logbookEntries.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as any, aircraftId: aircraftId as any }
      : 'skip'
  );
  const byProject = useQuery(
    (api as any).logbookEntries.listByProject,
    projectId && !aircraftId ? { projectId: projectId as any } : 'skip'
  );
  return aircraftId ? byAircraft : byProject;
}

export function useLogbookEntry(entryId: string | undefined) {
  return useQuery(
    (api as any).logbookEntries.get,
    entryId ? { entryId: entryId as any } : 'skip'
  );
}

export function useSearchLogbookEntries() {
  return (api as any).logbookEntries.search;
}

export function useAddLogbookEntries() {
  return useMutation((api as any).logbookEntries.addBatch);
}

export function useUpdateLogbookEntry() {
  return useMutation((api as any).logbookEntries.update);
}

export function useRemoveLogbookEntry() {
  return useMutation((api as any).logbookEntries.remove);
}

// --- FAA Form 337 Records ------------------------------------------------
export function useForm337Records(projectId: string | undefined) {
  return useQuery(
    (api as any).form337Records.listByProject,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useAddForm337Record() {
  return useMutation((api as any).form337Records.add);
}

export function useUpdateForm337Record() {
  return useMutation((api as any).form337Records.update);
}

export function useRemoveForm337Record() {
  return useMutation((api as any).form337Records.remove);
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
            projectId: projectId as any,
            aircraftId: aircraftId as any,
            sourceDocumentId: sourceDocumentId as any,
          }
        : {
            projectId: projectId as any,
            aircraftId: aircraftId as any,
          }
      : 'skip';

  return useQuery(
    (api as any).logbookDraftEntries.listByAircraft,
    queryArgs
  );
}

export function useAddLogbookDraftEntries() {
  return useMutation((api as any).logbookDraftEntries.addBatch);
}

export function useRemoveLogbookDraftEntriesBySourceDocument() {
  return useMutation((api as any).logbookDraftEntries.removeBySourceDocument);
}

export function useRemoveSelectedLogbookDraftEntries() {
  return useMutation((api as any).logbookDraftEntries.removeSelected);
}

export function useImportSelectedLogbookDraftEntries() {
  return useMutation((api as any).logbookDraftEntries.importSelected);
}

// --- Aircraft Components -------------------------------------------------
export function useAircraftComponents(projectId: string | undefined, aircraftId?: string, statusFilter?: string) {
  return useQuery(
    (api as any).aircraftComponents.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as any, aircraftId: aircraftId as any, statusFilter }
      : 'skip'
  );
}

export function useAddAircraftComponent() {
  return useMutation((api as any).aircraftComponents.add);
}

export function useUpdateAircraftComponent() {
  return useMutation((api as any).aircraftComponents.update);
}

export function useRemoveAircraftComponent() {
  return useMutation((api as any).aircraftComponents.remove);
}

// --- Compliance Rules ----------------------------------------------------
export function useComplianceRules(regulatoryPack?: string) {
  const byPack = useQuery(
    (api as any).complianceRules.listByPack,
    regulatoryPack ? { regulatoryPack } : 'skip'
  );
  const all = useQuery(
    (api as any).complianceRules.listAll,
    regulatoryPack ? 'skip' : {}
  );
  return regulatoryPack ? byPack : all;
}

export function useSeedComplianceRules() {
  return useMutation((api as any).complianceRules.seedPart43And91);
}

export function useSeedRulePack() {
  return useMutation((api as any).complianceRules.seedRulePack);
}

// --- Compliance Findings -------------------------------------------------
export function useComplianceFindings(projectId: string | undefined, aircraftId?: string, statusFilter?: string) {
  const byAircraft = useQuery(
    (api as any).complianceFindings.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as any, aircraftId: aircraftId as any, statusFilter }
      : 'skip'
  );
  const byProject = useQuery(
    (api as any).complianceFindings.listByProject,
    projectId && !aircraftId ? { projectId: projectId as any } : 'skip'
  );
  return aircraftId ? byAircraft : byProject;
}

export function useAddComplianceFindings() {
  return useMutation((api as any).complianceFindings.addBatch);
}

export function useUpdateComplianceFindingStatus() {
  return useMutation((api as any).complianceFindings.updateStatus);
}

export function useConvertFindingToIssue() {
  return useMutation((api as any).complianceFindings.convertToIssue);
}

// --- Audit Checklists ----------------------------------------------------
export function useChecklistRuns(projectId: string | undefined) {
  return useQuery(
    (api as any).auditChecklists.listRunsByProject,
    projectId ? { projectId: projectId as any } : "skip"
  );
}

export function useChecklistItems(runId: string | undefined) {
  return useQuery(
    (api as any).auditChecklists.listItemsByRun,
    runId ? { checklistRunId: runId as any } : "skip"
  );
}

export function useCreateChecklistRunFromTemplate() {
  return useMutation((api as any).auditChecklists.createRunFromTemplate);
}

export function useCreateChecklistRunFromTemplateAndLibrary() {
  return useMutation((api as any).auditChecklists.createRunFromTemplateAndLibrary);
}

export function useCreateChecklistRunFromSelectedDocs() {
  return useMutation((api as any).auditChecklists.createRunFromSelectedDocuments);
}

export function useChecklistCustomTemplateItems(
  projectId: string | undefined,
  framework: string | undefined,
  subtypeId?: string
) {
  return useQuery(
    (api as any).auditChecklists.listCustomTemplateItems,
    projectId && framework ? { projectId: projectId as any, framework, subtypeId } : "skip"
  );
}

export function useSaveChecklistCustomTemplateItems() {
  return useMutation((api as any).auditChecklists.saveCustomTemplateItems);
}

export function useUpdateChecklistRun() {
  return useMutation((api as any).auditChecklists.updateRun);
}

export function useDeleteChecklistRun() {
  return useMutation((api as any).auditChecklists.deleteRun);
}

export function useUpdateChecklistItem() {
  return useMutation((api as any).auditChecklists.updateItem);
}

export function useDeleteChecklistItem() {
  return useMutation((api as any).auditChecklists.deleteItem);
}

export function useAddChecklistManualItem() {
  return useMutation((api as any).auditChecklists.addManualItem);
}

export function useEscalateChecklistItemToIssue() {
  return useMutation((api as any).auditChecklists.escalateItemToIssue);
}

// --- Analytics ----------------------------------------------------------
export function useProjectStats(projectId: string | undefined) {
  return useQuery(
    (api as any).analytics.getProjectStats,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

export function useComplianceTrend(projectId: string | undefined) {
  return useQuery(
    (api as any).analytics.getComplianceTrend,
    projectId ? { projectId: projectId as any } : 'skip'
  );
}

export function useCrossProjectSummary() {
  return useQuery((api as any).analytics.getCrossProjectSummary, {});
}

// --- Product events ---------------------------------------------------------
/** Logs a lightweight analytics/KPI event (may be called without auth for public landing). */
export function useLogProductEvent() {
  return useMutation((api as any).productEvents.logProductEvent);
}
