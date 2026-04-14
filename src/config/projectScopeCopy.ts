/** Shared copy for project scope / empty states (sidebar, splash, modules). */
export const PROJECT_SCOPE_COPY = {
  noProjectSelected: 'No project selected',
  projectMenuHint: 'Use the project menu to create or pick one.',
  emptyListTenant: 'No projects yet. Use New Project below.',
  emptyListStaffScoped: 'No projects for this company yet. Use New Project below.',
  emptyListStaffNoCompany: 'Select a company to see projects.',
  splashNoProjectBanner:
    'No project selected — evidence and some actions use a project. Open the project menu in the sidebar to create or pick one.',
  /** Shown in the project menu when a company context is known — deletion is only on that page. */
  manageProjectsLinkLabel: 'Company projects (create / delete)',
} as const;
