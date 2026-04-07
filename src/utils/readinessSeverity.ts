/** Shape of `getCommandCenterSummary` return; keep loose for Convex client typing. */
export type CommandCenterSummaryLike = {
  issues?: { overdue?: readonly unknown[] };
  roster?: { overdueAssignments?: readonly unknown[] };
  checklistDueAlerts?: ReadonlyArray<{ kind?: string }>;
  inspectionSchedule?: { alerts?: ReadonlyArray<{ kind?: string }> };
  /** Per-route: true when the project has saved data for that area (sidebar activity dots). */
  navSectionActivity?: Readonly<Record<string, boolean>>;
};

export type ScopeReadinessLevel =
  | 'no_project'
  | 'needs_company'
  | 'loading'
  | 'overdue'
  | 'due_soon'
  | 'clear';

function checklistOverdue(s: CommandCenterSummaryLike): boolean {
  return (s.checklistDueAlerts ?? []).some((a) => a.kind === 'overdue');
}

function checklistDueSoon(s: CommandCenterSummaryLike): boolean {
  return (s.checklistDueAlerts ?? []).some((a) => a.kind === 'due_soon');
}

function scheduleOverdue(s: CommandCenterSummaryLike): boolean {
  return (s.inspectionSchedule?.alerts ?? []).some((a) => a.kind === 'overdue');
}

function scheduleDueSoon(s: CommandCenterSummaryLike): boolean {
  return (s.inspectionSchedule?.alerts ?? []).some((a) => a.kind === 'due_soon');
}

function issuesOverdue(s: CommandCenterSummaryLike): boolean {
  return (s.issues?.overdue?.length ?? 0) > 0;
}

function rosterOverdue(s: CommandCenterSummaryLike): boolean {
  return (s.roster?.overdueAssignments?.length ?? 0) > 0;
}

export function fullReadinessOverdue(s: CommandCenterSummaryLike): boolean {
  return (
    issuesOverdue(s) ||
    rosterOverdue(s) ||
    checklistOverdue(s) ||
    scheduleOverdue(s)
  );
}

export function fullReadinessDueSoon(s: CommandCenterSummaryLike): boolean {
  return checklistDueSoon(s) || scheduleDueSoon(s);
}

function navLevelFromSeverity(
  overdue: boolean,
  dueSoon: boolean,
): 'overdue' | 'due_soon' | null {
  if (overdue) return 'overdue';
  if (dueSoon) return 'due_soon';
  return null;
}

export function scopeReadinessLevel(opts: {
  activeProjectId: string | null | undefined;
  isAerogapEmployee: boolean;
  activeCompanyId: string | null | undefined;
  summary: CommandCenterSummaryLike | undefined;
}): ScopeReadinessLevel {
  if (!opts.activeProjectId) return 'no_project';
  if (opts.isAerogapEmployee && !opts.activeCompanyId) return 'needs_company';
  if (opts.summary === undefined) return 'loading';
  if (fullReadinessOverdue(opts.summary)) return 'overdue';
  if (fullReadinessDueSoon(opts.summary)) return 'due_soon';
  return 'clear';
}

/** Attention-only levels for sidebar nav items; null when nothing to surface. */
export function navAttentionLevel(
  path: string,
  summary: CommandCenterSummaryLike | undefined,
  hasProject: boolean,
): 'overdue' | 'due_soon' | null {
  if (!hasProject || summary === undefined) return null;
  switch (path) {
    case '/quality-command-center':
      return navLevelFromSeverity(
        fullReadinessOverdue(summary),
        fullReadinessDueSoon(summary),
      );
    case '/checklists':
      return navLevelFromSeverity(checklistOverdue(summary), checklistDueSoon(summary));
    case '/entity-issues':
      return navLevelFromSeverity(issuesOverdue(summary), false);
    case '/logbook':
      return navLevelFromSeverity(scheduleOverdue(summary), scheduleDueSoon(summary));
    default:
      return null;
  }
}

export function scopeLevelAriaLabel(level: ScopeReadinessLevel): string {
  switch (level) {
    case 'no_project':
      return 'No project selected';
    case 'needs_company':
      return 'Select a company to scope work';
    case 'loading':
      return 'Loading readiness status';
    case 'overdue':
      return 'Overdue items need attention';
    case 'due_soon':
      return 'Items due soon';
    case 'clear':
      return 'No overdue or due-soon readiness issues';
    default:
      return 'Readiness status';
  }
}

export function navAttentionTitle(level: 'overdue' | 'due_soon'): string {
  return level === 'overdue' ? 'Has overdue items' : 'Has items due soon';
}

export function navSectionHasActivity(
  path: string,
  summary: CommandCenterSummaryLike | undefined,
): boolean {
  return Boolean(summary?.navSectionActivity?.[path]);
}

export function navSectionActivityTitle(path: string): string {
  switch (path) {
    case '/quality-command-center':
      return 'Project has compliance activity';
    case '/library':
      return 'Library has documents';
    case '/review':
      return 'Paperwork reviews in project';
    case '/revisions':
      return 'Revision tracking in project';
    case '/entity-issues':
      return 'CARs or issues in project';
    case '/roster':
      return 'Personnel on roster';
    case '/checklists':
      return 'Checklists in project';
    case '/analysis':
      return 'Analyses in project';
    case '/guided-audit':
      return 'Guided audit progress in project';
    case '/audit':
      return 'Audit simulations in project';
    case '/report':
      return 'Report source data available';
    case '/analytics':
      return 'Analytics data available';
    case '/logbook':
      return 'Logbook or schedule data';
    default:
      return 'Has saved content';
  }
}
