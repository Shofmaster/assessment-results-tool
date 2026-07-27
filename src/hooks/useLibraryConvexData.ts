import { useMemo, useCallback } from 'react';
import { useMutation, useAction, usePaginatedQuery, useConvex } from 'convex/react';
import { useQuery } from './useConvexQueryNoThrow';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import type { InspectionScheduleItem } from '../types/inspectionSchedule';
import type { LogbookEntry } from '../types/logbook';
import { buildScheduleLogbookCrossRef } from '../services/scheduleLogbookCrossRef';
import {
  searchDocuments,
  type SearchDocumentsArgs,
} from '../services/driveSearchIntegration';

// --- Technical publications (company library) ----------------------------
export type LibraryAircraftScope =
  | { kind: 'fleet' }
  | { kind: 'type'; aircraftTypeId: string }
  | { kind: 'tail'; aircraftId: string };

export function useTechnicalPublicationsByCompany(
  companyId: string | undefined,
  publicationType?: 'maintenance_manual' | 'parts_catalog' | 'wiring_diagram' | 'logbook_scan' | 'other',
  folderId?: string | null,
  scope?: LibraryAircraftScope,
  scopeProjectId?: string,
) {
  return useQuery(
    api.technicalPublications.listByCompany,
    companyId
      ? {
          companyId: companyId as Id<'companies'>,
          ...(publicationType ? { publicationType } : {}),
          ...(folderId !== undefined ? { folderId: folderId as any } : {}),
          ...(scopeProjectId ? { scopeProjectId: scopeProjectId as Id<'projects'> } : {}),
          ...(scope?.kind === 'tail'
            ? { aircraftId: scope.aircraftId as Id<'aircraftAssets'> }
            : {}),
          ...(scope?.kind === 'type'
            ? { aircraftTypeId: scope.aircraftTypeId as Id<'aircraftTypes'> }
            : {}),
        }
      : 'skip'
  );
}

/**
 * Cursor-paginated publications for the unscoped / type-filtered Library browse list.
 * Returns { results, status, loadMore, isLoading }. Does NOT support aircraft-scope —
 * scoped browsing keeps using useTechnicalPublicationsByCompany (bounded, non-indexable).
 */
export function usePublicationsPaginatedByCompany(
  companyId: string | undefined,
  publicationType?: 'maintenance_manual' | 'parts_catalog' | 'wiring_diagram' | 'logbook_scan' | 'other',
  folderId?: string | null,
  initialNumItems = 50,
) {
  return usePaginatedQuery(
    api.technicalPublications.pageByCompany,
    companyId
      ? {
          companyId: companyId as Id<'companies'>,
          ...(publicationType ? { publicationType } : {}),
          ...(folderId !== undefined ? { folderId: folderId as any } : {}),
        }
      : 'skip',
    { initialNumItems },
  );
}

export function useTechnicalPublicationsByAircraft(projectId: string | undefined, aircraftId: string | undefined) {
  return useQuery(
    api.technicalPublications.listByAircraft,
    projectId && aircraftId
      ? { projectId: projectId as Id<'projects'>, aircraftId: aircraftId as Id<'aircraftAssets'> }
      : 'skip'
  );
}

export function useTechnicalPublication(publicationId: string | undefined) {
  return useQuery(
    api.technicalPublications.get,
    publicationId ? { publicationId: publicationId as Id<'technicalPublications'> } : 'skip'
  );
}

export function usePublicationSections(publicationId: string | undefined) {
  return useQuery(
    api.publicationSections.listByPublication,
    publicationId ? { publicationId: publicationId as Id<'technicalPublications'> } : 'skip'
  );
}

export function useCreateTechnicalPublication() {
  return useMutation(api.technicalPublications.create);
}

export function useUpdateTechnicalPublication() {
  return useMutation(api.technicalPublications.update);
}

export function useMovePublicationToFolder() {
  return useMutation(api.technicalPublications.update);
}

export function useRemoveTechnicalPublication() {
  return useMutation(api.technicalPublications.remove);
}

export function useLinkPublicationAircraft() {
  return useMutation(api.technicalPublications.linkAircraft);
}

export function useLinkPublicationAircraftType() {
  return useMutation(api.technicalPublications.linkAircraftType);
}

// --- Aircraft types (project-scoped) -------------------------------------
export function useAircraftTypes(projectId: string | undefined) {
  return useQuery(
    api.aircraftTypes.listByProject,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

export function useAircraftType(aircraftTypeId: string | undefined) {
  return useQuery(
    api.aircraftTypes.get,
    aircraftTypeId ? { aircraftTypeId: aircraftTypeId as Id<'aircraftTypes'> } : 'skip',
  );
}

export function useCreateAircraftType() {
  return useMutation(api.aircraftTypes.create);
}

export function useUpdateAircraftType() {
  return useMutation(api.aircraftTypes.update);
}

export function useRemoveAircraftType() {
  return useMutation(api.aircraftTypes.remove);
}

export function useBackfillAircraftTypes() {
  return useMutation(api.aircraftTypes.backfillFromAssets);
}

/** Aircraft list for Library (no logbook entitlement required). */
export function useAircraftAssetsForLibrary(projectId: string | undefined) {
  return useQuery(
    api.aircraftAssets.listByProjectForLibrary,
    projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
  );
}

// --- Manual groups (logical bundles of technical publications) -----------
export function useManualGroupsByCompany(
  companyId: string | undefined,
  publicationType?: 'maintenance_manual' | 'parts_catalog' | 'wiring_diagram' | 'logbook_scan' | 'other'
) {
  return useQuery(
    api.manualGroups.listByCompany,
    companyId
      ? {
          companyId: companyId as Id<'companies'>,
          ...(publicationType ? { publicationType } : {}),
        }
      : 'skip'
  );
}

export function useManualGroupsByCompanyWithCounts(
  companyId: string | undefined,
  publicationType?: 'maintenance_manual' | 'parts_catalog' | 'wiring_diagram' | 'logbook_scan' | 'other'
) {
  return useQuery(
    api.manualGroups.listByCompanyWithCounts,
    companyId
      ? {
          companyId: companyId as Id<'companies'>,
          ...(publicationType ? { publicationType } : {}),
        }
      : 'skip'
  );
}

export function useCreateManualGroup() {
  return useMutation(api.manualGroups.create);
}

export function useUpdateManualGroup() {
  return useMutation(api.manualGroups.update);
}

export function useRemoveManualGroup() {
  return useMutation(api.manualGroups.remove);
}

export function useAssignPublicationsToManualGroup() {
  return useMutation(api.manualGroups.assignPublications);
}

export function useReplacePublicationSections() {
  return useMutation(api.publicationSections.replaceAll);
}

export function useDocumentChunksSearch() {
  const convex = useConvex();
  // Drive-hosted search replacement for the old convex.action(documentChunks.search).
  return useCallback(
    (args: SearchDocumentsArgs) => searchDocuments(convex, args),
    [convex],
  );
}

// --- Library folders ------------------------------------------------------
export function useLibraryFolders(companyId: string | undefined) {
  return useQuery(
    api.libraryFolders.listByCompany,
    companyId ? { companyId: companyId as Id<'companies'> } : 'skip',
  );
}

export function useCreateLibraryFolder() {
  return useMutation(api.libraryFolders.create);
}

export function useRenameLibraryFolder() {
  return useMutation(api.libraryFolders.rename);
}

export function useMoveLibraryFolder() {
  return useMutation(api.libraryFolders.move);
}

export function useRemoveLibraryFolder() {
  return useMutation(api.libraryFolders.remove);
}

/** Client-side join of schedule items and logbook entries for compliance reporting. */
export function useScheduleLogbookCrossRef(
  scheduleItems: InspectionScheduleItem[] | undefined,
  logbookEntries: LogbookEntry[] | undefined
) {
  return useMemo(() => {
    if (!scheduleItems?.length) return [];
    return buildScheduleLogbookCrossRef(scheduleItems, logbookEntries ?? []);
  }, [scheduleItems, logbookEntries]);
}

