import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import {
  useCompaniesForCurrentUser,
  useIsAerogapEmployee,
  useProjects,
  useUpsertUserSettings,
  useUserSettings,
} from './useConvexData';
import { toastSettingsSaveFailed } from '../utils/settingsToast';

/**
 * Picks the company (staff) and project the workspace opens on, from the saved
 * settings or the first available one.
 *
 * Lives outside CompanyProjectSwitcher and is called once from the app shell:
 * on phones the switcher is only mounted while the menu drawer is open, so
 * when this ran inside it the saved project was not restored until the menu
 * was opened, and every page said "Select a project".
 */
export function useActiveProjectAutoSelect(): void {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const projectsQuery = useProjects();
  const companies = (useCompaniesForCurrentUser() || []) as any[];
  const isAerogapEmployee = useIsAerogapEmployee();
  const upsertSettings = useUpsertUserSettings();
  const userSettings = useUserSettings();
  const activeCompanyIdFromSettings = userSettings?.activeCompanyId as string | undefined;
  const projectsForSelection = useMemo(
    () =>
      filterProjectsForScope(
        (projectsQuery || []) as any[],
        isAerogapEmployee,
        activeCompanyIdFromSettings
      ),
    [projectsQuery, isAerogapEmployee, activeCompanyIdFromSettings]
  );

  useEffect(() => {
    if (!isAerogapEmployee) return;
    if (userSettings === undefined) return;
    if (activeCompanyIdFromSettings) return;
    if (!companies.length) return;
    const firstId = (companies[0] as any)._id;
    upsertSettings({ activeCompanyId: firstId as any }).catch(toastSettingsSaveFailed);
  }, [isAerogapEmployee, userSettings, activeCompanyIdFromSettings, companies, upsertSettings]);

  useEffect(() => {
    if (userSettings === undefined) return;
    // Still loading is not "no projects": treating it as empty cleared the
    // active project and saved null over it on every page load.
    if (projectsQuery === undefined) return;

    if (projectsForSelection.length === 0) {
      if (activeProjectId) {
        setActiveProjectId(null);
        upsertSettings({ activeProjectId: null }).catch(toastSettingsSaveFailed);
      }
      return;
    }

    const stillExists = activeProjectId
      ? projectsForSelection.some((p: any) => p._id === activeProjectId)
      : false;

    if (!activeProjectId || !stillExists) {
      const saved = userSettings?.activeProjectId as string | undefined;
      const preferSaved = Boolean(saved && projectsForSelection.some((p: any) => p._id === saved));
      const fallbackId = preferSaved ? saved! : projectsForSelection[0]._id;
      setActiveProjectId(fallbackId);
      if (!preferSaved || fallbackId !== saved) {
        upsertSettings({ activeProjectId: fallbackId as any }).catch(toastSettingsSaveFailed);
      }
    }
  }, [
    projectsQuery,
    projectsForSelection,
    activeProjectId,
    setActiveProjectId,
    upsertSettings,
    userSettings,
  ]);
}

/** Staff see the projects of the company they have scoped to; everyone else sees all of theirs. */
export function filterProjectsForScope(
  projects: any[],
  isAerogapEmployee: boolean,
  activeCompanyId: string | undefined
): any[] {
  if (!isAerogapEmployee) return projects;
  if (!activeCompanyId) return [];
  return projects.filter(
    (p: any) => p.companyId != null && String(p.companyId) === String(activeCompanyId)
  );
}
