import { useMutation } from 'convex/react';
import { useQuery } from './useConvexQueryNoThrow';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';

// --- Roster ---------------------------------------------------------------
export function useRosterRequirementTypes(projectId: string | undefined) {
  return useQuery(
    api.roster.listRequirementTypes,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useAddRosterRequirementType() {
  return useMutation(api.roster.addRequirementType);
}

export function useUpdateRosterRequirementType() {
  return useMutation(api.roster.updateRequirementType);
}

export function useRemoveRosterRequirementType() {
  return useMutation(api.roster.removeRequirementType);
}

export function useRosterPersonnel(projectId: string | undefined) {
  return useQuery(
    api.roster.listPersonnel,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useAddRosterPerson() {
  return useMutation(api.roster.addPerson);
}

export function useUpdateRosterPerson() {
  return useMutation(api.roster.updatePerson);
}

export function useRemoveRosterPerson() {
  return useMutation(api.roster.removePerson);
}

export function useRosterAssignments(projectId: string | undefined) {
  return useQuery(
    api.roster.listAssignments,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
}

export function useAddRosterAssignment() {
  return useMutation(api.roster.addAssignment);
}

export function useUpdateRosterAssignment() {
  return useMutation(api.roster.updateAssignment);
}

export function useRemoveRosterAssignment() {
  return useMutation(api.roster.removeAssignment);
}

export function useRosterDashboard(projectId: string | undefined, capability?: string) {
  return useQuery(
    api.roster.getDashboard,
    projectId ? { projectId: projectId as Id<"projects">, capability } : "skip"
  );
}

export function useMigrateRosterQualificationRules() {
  return useMutation(api.roster.migrateRosterQualificationRulesForProject);
}

export function useRosterDepartments(projectId: string | undefined) {
  return useQuery(
    api.roster.listDepartments,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useAddRosterDepartment() {
  return useMutation(api.roster.addDepartment);
}

export function useRemoveRosterDepartment() {
  return useMutation(api.roster.removeDepartment);
}

export function useRosterCardColorRules(projectId: string | undefined) {
  return useQuery(
    api.roster.listCardColorRules,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useAddRosterCardColorRule() {
  return useMutation(api.roster.addCardColorRule);
}

export function useRemoveRosterCardColorRule() {
  return useMutation(api.roster.removeCardColorRule);
}

export function useSetPersonCardColor() {
  return useMutation(api.roster.setPersonCardColor);
}

export function useSetBulkPersonCardColors() {
  return useMutation(api.roster.setBulkPersonCardColors);
}

export function useRosterReportingLines(projectId: string | undefined) {
  return useQuery(
    api.roster.listReportingLines,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useRosterOrgChartLayouts(projectId: string | undefined) {
  return useQuery(
    api.roster.listOrgChartLayouts,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useAddFunctionalReportingLine() {
  return useMutation(api.roster.addFunctionalReportingLine);
}

export function useRemoveReportingLine() {
  return useMutation(api.roster.removeReportingLine);
}

export function useUpdateFunctionalReportingLinePath() {
  return useMutation(api.roster.updateFunctionalReportingLinePath);
}

export function useRosterOrgPrimaryRoutes(projectId: string | undefined) {
  return useQuery(
    api.roster.listOrgPrimaryRoutes,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
}

export function useUpsertOrgChartLayout() {
  return useMutation(api.roster.upsertOrgChartLayout);
}

export function useUpsertOrgPrimaryRoute() {
  return useMutation(api.roster.upsertOrgPrimaryRoute);
}

export function useResetOrgChartLayouts() {
  return useMutation(api.roster.resetOrgChartLayouts);
}

