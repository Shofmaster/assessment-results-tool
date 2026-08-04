/**
 * Single source of truth for app navigation labels, paths, groups, and search keywords.
 * Consumed by Sidebar, GlobalSearch, Splash destinations, and App view titles.
 */

import type { IconType } from 'react-icons';
import {
  FiFolder,
  FiFileText,
  FiUsers,
  FiSettings,
  FiRefreshCw,
  FiBarChart2,
  FiCheckSquare,
  FiList,
  FiAlertTriangle,
  FiBookOpen,
  FiHelpCircle,
  FiHome,
  FiGrid,
  FiClipboard,
  FiLayers,
  FiCalendar,
  FiEdit3,
  FiTool,
  FiSend,
} from 'react-icons/fi';
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from './featureKeys';

export type NavGroupId = 'audit' | 'documents' | 'operations' | 'tools';

export type NavIconKey =
  | 'home'
  | 'help'
  | 'settings'
  | 'folder'
  | 'fileText'
  | 'users'
  | 'refresh'
  | 'barChart'
  | 'checkSquare'
  | 'list'
  | 'alert'
  | 'bookOpen'
  | 'grid'
  | 'clipboard'
  | 'layers'
  | 'calendar'
  | 'edit'
  | 'tool'
  | 'send';

const NAV_ICONS: Record<NavIconKey, IconType> = {
  home: FiHome,
  help: FiHelpCircle,
  settings: FiSettings,
  folder: FiFolder,
  fileText: FiFileText,
  users: FiUsers,
  refresh: FiRefreshCw,
  barChart: FiBarChart2,
  checkSquare: FiCheckSquare,
  list: FiList,
  alert: FiAlertTriangle,
  bookOpen: FiBookOpen,
  grid: FiGrid,
  clipboard: FiClipboard,
  layers: FiLayers,
  calendar: FiCalendar,
  edit: FiEdit3,
  tool: FiTool,
  send: FiSend,
};

export function resolveNavIcon(key: NavIconKey): IconType {
  return NAV_ICONS[key];
}

export type NavFeatureFlag =
  | FeatureKey
  | 'quality-hub'
  | 'logbook'
  | 'logbook-off'
  | 'aerogap-employee'
  | 'analysis-employee'
  | 'always';

export type NavItemDef = {
  id: string;
  label: string;
  path: string;
  icon: NavIconKey;
  hint?: string;
  end?: boolean;
  keywords?: string[];
  description?: string;
  /** When all listed flags pass (AND). Empty = always. */
  requires?: NavFeatureFlag[];
  /** Sidebar group; omit for shared/top-level items. */
  group?: NavGroupId;
  /**
   * Flat slot above collapsible groups (e.g. Fleet). Ignored when `group` is set.
   * Primary items stay visible even when every group defaults to collapsed.
   */
  primary?: boolean;
  showInSidebar?: boolean;
  showInSearch?: boolean;
  showInSplash?: boolean;
};

export type NavGroupDef = {
  id: NavGroupId;
  label: string;
  icon: NavIconKey;
  showWorkflowHints?: boolean;
};

export type NavFlags = {
  guidedAudit: boolean;
  checklists: boolean;
  paperworkReview: boolean;
  auditSimulation: boolean;
  entityIssues: boolean;
  reportBuilder: boolean;
  library: boolean;
  revisions: boolean;
  manualManagement: boolean;
  schedule: boolean;
  qualityHub: boolean;
  dctCompliance: boolean;
  manualWriter: boolean;
  form337: boolean;
  analysis: boolean;
  analytics: boolean;
  logbookEnabled: boolean;
  aerogapEmployee: boolean;
  isAdmin: boolean;
};

export const NAV_GROUPS: NavGroupDef[] = [
  { id: 'audit', label: 'Audit', icon: 'clipboard', showWorkflowHints: true },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'operations', label: 'Operations', icon: 'calendar' },
  { id: 'tools', label: 'Tools', icon: 'tool' },
];

/** First visit: Audit open; Tools stay collapsed. */
export const DEFAULT_OPEN_GROUPS: Record<NavGroupId, boolean> = {
  audit: true,
  documents: false,
  operations: false,
  tools: false,
};

export const NAV_ITEMS: NavItemDef[] = [
  // Shared
  {
    id: 'home',
    label: 'Home',
    path: '/splash',
    icon: 'home',
    keywords: ['dashboard', 'start', 'ask'],
    description: 'Ask an Expert and get started',
    showInSidebar: false,
    showInSearch: true,
    showInSplash: false,
  },
  {
    id: 'help',
    label: 'Help',
    path: '/help',
    icon: 'help',
    keywords: ['support', 'docs'],
    description: 'Help Center',
    showInSidebar: false,
    showInSearch: true,
    showInSplash: false,
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'settings',
    showInSidebar: false,
    showInSearch: true,
    showInSplash: false,
  },

  // Audit
  {
    id: 'guided-audit',
    label: 'Guided Audit',
    path: '/guided-audit',
    icon: 'list',
    hint: 'Everything in one flow',
    keywords: ['guided', 'checklist', 'review'],
    description: 'Compliance review end-to-end',
    requires: [FEATURE_KEYS.GUIDED_AUDIT],
    group: 'audit',
    showInSplash: true,
  },
  {
    id: 'checklists',
    label: 'Checklists',
    path: '/checklists',
    icon: 'checkSquare',
    hint: 'Prep what auditors ask for',
    requires: [FEATURE_KEYS.CHECKLISTS],
    group: 'audit',
  },
  {
    id: 'paperwork-review',
    label: 'Paperwork Review',
    path: '/review',
    icon: 'fileText',
    hint: 'Check docs vs. references',
    keywords: ['paperwork', 'documents', 'findings'],
    description: 'Document findings',
    requires: [FEATURE_KEYS.PAPERWORK_REVIEW],
    group: 'audit',
    showInSplash: true,
  },
  {
    id: 'audit-simulation',
    label: 'Audit Simulation',
    path: '/audit',
    icon: 'users',
    hint: 'Practice with AI auditors',
    keywords: ['audit', 'simulation', 'agents'],
    description: 'Agent audit chat',
    requires: [FEATURE_KEYS.AUDIT_SIMULATION],
    group: 'audit',
    showInSplash: true,
  },
  {
    id: 'entity-issues',
    label: 'CARs & Issues',
    path: '/entity-issues',
    icon: 'alert',
    hint: 'Fix findings before the audit',
    keywords: ['cars', 'issues', 'corrective'],
    description: 'Corrective actions',
    requires: [FEATURE_KEYS.ENTITY_ISSUES],
    group: 'audit',
    showInSplash: true,
  },
  {
    id: 'report-builder',
    label: 'Report Builder',
    path: '/report',
    icon: 'bookOpen',
    hint: 'Assemble the final report',
    requires: [FEATURE_KEYS.REPORT_BUILDER],
    group: 'audit',
  },

  // Documents
  {
    id: 'library',
    label: 'Library',
    path: '/library',
    icon: 'folder',
    keywords: ['library', 'references', 'standards'],
    description: 'Standards and evidence library',
    requires: [FEATURE_KEYS.LIBRARY],
    group: 'documents',
    showInSplash: true,
  },
  {
    id: 'revisions',
    label: 'Revisions',
    path: '/revisions',
    icon: 'refresh',
    requires: [FEATURE_KEYS.REVISIONS],
    group: 'documents',
  },
  {
    id: 'manual-control',
    label: 'Manual Control',
    path: '/manual-management',
    icon: 'bookOpen',
    keywords: ['manuals', 'manual library', 'versions'],
    description: 'Versioned controlled manuals',
    requires: [FEATURE_KEYS.MANUAL_MANAGEMENT],
    group: 'documents',
  },
  {
    id: 'entry-review-docs',
    label: 'Entry Review',
    path: '/logbook/entry-review',
    icon: 'clipboard',
    keywords: ['logbook', 'entry'],
    requires: ['logbook-off'],
    group: 'documents',
  },

  // Operations — Roster is not coupled to entity-issues
  {
    id: 'roster',
    label: 'Roster',
    path: '/roster',
    icon: 'users',
    keywords: ['roster', 'qualifications', 'personnel'],
    description: 'Qualifications and assignments',
    group: 'operations',
  },
  {
    id: 'schedule',
    label: 'Recurring Schedule',
    path: '/schedule',
    icon: 'calendar',
    keywords: ['schedule', 'inspection', 'recurring'],
    description: 'Inspection and recurring items',
    requires: [FEATURE_KEYS.SCHEDULE],
    group: 'operations',
    showInSplash: true,
  },
  {
    id: 'compliance-report',
    label: 'Compliance Report',
    path: '/compliance-report',
    icon: 'fileText',
    hint: 'Schedule vs. logbook status',
    keywords: ['schedule', 'logbook'],
    requires: [FEATURE_KEYS.SCHEDULE],
    group: 'operations',
  },
  {
    id: 'entry-review-ops',
    label: 'Entry Review',
    path: '/logbook/entry-review',
    icon: 'clipboard',
    keywords: ['logbook'],
    end: true,
    requires: ['logbook'],
    group: 'operations',
  },

  // Primary (above collapsible groups) — Fleet left Operations so it stays visible
  // when groups default to collapsed.
  {
    id: 'fleet',
    label: 'Fleet',
    path: '/fleet',
    icon: 'send',
    end: true,
    // Fleet absorbed several previously separate surfaces — keep the old
    // vocabulary searchable so muscle memory still lands here.
    keywords: [
      'aircraft',
      'tail',
      'discrepancies',
      'squawk',
      'mel',
      'aircraft types',
      'utilization',
      'avianis',
      'ad watch',
      'monitoring',
    ],
    requires: ['logbook'],
    primary: true,
  },

  // Tools
  {
    id: 'quality-compliance',
    label: 'Quality & Compliance',
    path: '/quality-command-center',
    icon: 'grid',
    keywords: ['quality', 'dashboard', 'command', 'chief', 'inspector', 'readiness', 'qm', 'prep', 'compliance'],
    description: 'Readiness summary, audit prep, CARs, roster, inspections, and checklists',
    requires: ['quality-hub'],
    group: 'tools',
    showInSplash: true,
  },
  {
    id: 'dct-compliance',
    label: 'DCT Compliance',
    path: '/dct-compliance',
    icon: 'layers',
    hint: 'FAA SAS traceability',
    end: true,
    requires: [FEATURE_KEYS.DCT_COMPLIANCE],
    group: 'tools',
  },
  {
    id: 'manual-writer',
    label: 'Manual Writer',
    path: '/manual-writer',
    icon: 'edit',
    requires: [FEATURE_KEYS.MANUAL_WRITER],
    group: 'tools',
  },
  {
    id: 'form-337',
    label: 'FAA Form 337',
    path: '/form-337',
    icon: 'fileText',
    keywords: ['337', 'form 337', 'faa', 'major repair', 'alteration'],
    description: 'Form 337 records',
    requires: [FEATURE_KEYS.FORM_337],
    group: 'tools',
    showInSplash: true,
  },
  {
    id: 'analysis',
    label: 'Analysis',
    path: '/analysis',
    icon: 'fileText',
    keywords: ['analysis', 'insights', 'ai'],
    description: 'AI analysis',
    requires: ['analysis-employee'],
    group: 'tools',
    showInSplash: true,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: 'barChart',
    requires: [FEATURE_KEYS.ANALYTICS],
    group: 'tools',
  },

  // Search-only extras
  {
    id: 'companies',
    label: 'Companies',
    path: '/companies',
    icon: 'folder',
    requires: ['aerogap-employee'],
    showInSidebar: false,
    showInSearch: true,
    showInSplash: false,
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    path: '/admin',
    icon: 'settings',
    requires: ['always'], // filtered specially via isAdmin in getSearchNavActions
    showInSidebar: false,
    showInSearch: true,
    showInSplash: false,
  },
  {
    id: 'logbook',
    label: 'Logbook Management',
    path: '/logbook',
    icon: 'clipboard',
    keywords: ['logbook', 'project', 'records'],
    description: 'Projects and records',
    requires: ['logbook'],
    showInSidebar: false,
    showInSearch: true,
    showInSplash: true,
  },
];

/** Extra view titles not covered by NAV_ITEMS (or aliases). */
const EXTRA_VIEW_TITLES: Record<string, string> = {
  '/': 'Logbook Management',
  '/logbook': 'Logbook Management',
  '/aerogap-dashboard': 'AeroGap Dashboard',
  '/companies': 'Companies',
  '/company-admin': 'Company admin',
  '/admin': 'Admin',
  '/help': 'Help Center',
  '/compliance-dashboard': 'Quality & Compliance',
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
};

function flagPasses(flag: NavFeatureFlag, flags: NavFlags): boolean {
  switch (flag) {
    case 'always':
      return true;
    case 'quality-hub':
      return flags.qualityHub;
    case 'logbook':
      return flags.logbookEnabled;
    case 'logbook-off':
      return !flags.logbookEnabled;
    case 'aerogap-employee':
      return flags.aerogapEmployee;
    case 'analysis-employee':
      return flags.analysis && flags.aerogapEmployee;
    case FEATURE_KEYS.GUIDED_AUDIT:
      return flags.guidedAudit;
    case FEATURE_KEYS.CHECKLISTS:
      return flags.checklists;
    case FEATURE_KEYS.PAPERWORK_REVIEW:
      return flags.paperworkReview;
    case FEATURE_KEYS.AUDIT_SIMULATION:
      return flags.auditSimulation;
    case FEATURE_KEYS.ENTITY_ISSUES:
      return flags.entityIssues;
    case FEATURE_KEYS.REPORT_BUILDER:
      return flags.reportBuilder;
    case FEATURE_KEYS.LIBRARY:
      return flags.library;
    case FEATURE_KEYS.REVISIONS:
      return flags.revisions;
    case FEATURE_KEYS.MANUAL_MANAGEMENT:
      return flags.manualManagement;
    case FEATURE_KEYS.SCHEDULE:
      return flags.schedule;
    case FEATURE_KEYS.DCT_COMPLIANCE:
      return flags.dctCompliance;
    case FEATURE_KEYS.MANUAL_WRITER:
      return flags.manualWriter;
    case FEATURE_KEYS.FORM_337:
      return flags.form337;
    case FEATURE_KEYS.ANALYSIS:
      return flags.analysis;
    case FEATURE_KEYS.ANALYTICS:
      return flags.analytics;
    default:
      return true;
  }
}

function itemVisible(item: NavItemDef, flags: NavFlags): boolean {
  if (item.id === 'admin') return flags.isAdmin;
  if (!item.requires || item.requires.length === 0) return true;
  return item.requires.every((f) => flagPasses(f, flags));
}

export type ResolvedNavItem = {
  id: string;
  path: string;
  label: string;
  icon: IconType;
  hint?: string;
  end?: boolean;
  keywords?: string[];
  description?: string;
};

export type ResolvedNavGroup = {
  id: NavGroupId;
  label: string;
  icon: IconType;
  items: ResolvedNavItem[];
  showWorkflowHints?: boolean;
};

function toResolvedNavItem(item: NavItemDef): ResolvedNavItem {
  return {
    id: item.id,
    path: item.path,
    label: item.label,
    icon: resolveNavIcon(item.icon),
    hint: item.hint,
    end: item.end,
    keywords: item.keywords,
    description: item.description,
  };
}

export function getNavGroups(flags: NavFlags): ResolvedNavGroup[] {
  return NAV_GROUPS.map((group) => {
    const items = NAV_ITEMS.filter(
      (item) =>
        item.group === group.id &&
        item.showInSidebar !== false &&
        itemVisible(item, flags),
    ).map(toResolvedNavItem);
    return {
      id: group.id,
      label: group.label,
      icon: resolveNavIcon(group.icon),
      items,
      showWorkflowHints: group.showWorkflowHints,
    };
  }).filter((g) => g.items.length > 0);
}

/** Flat destinations rendered above collapsible sidebar groups. */
export function getPrimaryNavItems(flags: NavFlags): ResolvedNavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.primary === true &&
      !item.group &&
      item.showInSidebar !== false &&
      itemVisible(item, flags),
  ).map(toResolvedNavItem);
}

export function getSearchNavActions(flags: NavFlags): { label: string; path: string; keywords?: string[] }[] {
  const seen = new Set<string>();
  const actions: { label: string; path: string; keywords?: string[] }[] = [];
  for (const item of NAV_ITEMS) {
    if (item.showInSearch === false) continue;
    if (!itemVisible(item, flags)) continue;
    // Prefer operations Entry Review over documents duplicate in search
    if (item.id === 'entry-review-docs') continue;
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    actions.push({
      label: item.id === 'help' ? 'Help Center' : item.label,
      path: item.path,
      keywords: item.keywords,
    });
  }
  return actions;
}

export type SplashDestination = {
  path: string;
  label: string;
  description: string;
  keywords: string[];
};

export function getSplashDestinations(flags: NavFlags): SplashDestination[] {
  const seen = new Set<string>();
  const out: SplashDestination[] = [];
  for (const item of NAV_ITEMS) {
    if (!item.showInSplash) continue;
    if (!itemVisible(item, flags)) continue;
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    out.push({
      path: item.path,
      label: item.label,
      description: item.description || item.label,
      keywords: item.keywords || [item.label.toLowerCase()],
    });
  }
  return out;
}

export function getViewTitle(pathname: string): string {
  if (EXTRA_VIEW_TITLES[pathname]) return EXTRA_VIEW_TITLES[pathname];
  const item = NAV_ITEMS.find((i) => i.path === pathname);
  if (item) {
    if (item.id === 'help') return 'Help Center';
    return item.label;
  }
  return 'AeroGap';
}

export const GROUP_ROUTES: Record<NavGroupId, Set<string>> = {
  audit: new Set(['/guided-audit', '/checklists', '/review', '/audit', '/entity-issues', '/report']),
  documents: new Set(['/library', '/revisions', '/manual-management', '/logbook/entry-review']),
  operations: new Set(['/roster', '/schedule', '/compliance-report', '/logbook/entry-review']),
  tools: new Set([
    '/quality-command-center',
    '/dct-compliance',
    '/manual-writer',
    '/form-337',
    '/analysis',
    '/analytics',
  ]),
};

export function groupIdForPath(pathname: string, isLogbookEnabled: boolean): NavGroupId | null {
  if (GROUP_ROUTES.audit.has(pathname)) return 'audit';
  if (pathname === '/logbook/entry-review') {
    return isLogbookEnabled ? 'operations' : 'documents';
  }
  if (GROUP_ROUTES.documents.has(pathname)) return 'documents';
  if (GROUP_ROUTES.operations.has(pathname)) return 'operations';
  if (GROUP_ROUTES.tools.has(pathname)) return 'tools';
  return null;
}

/** Feature-gated paths → feature key for redirect toasts. */
export const FEATURE_GATED_ROUTES: { paths: Set<string>; featureKey: FeatureKey; label: string }[] = [
  {
    paths: new Set(['/manual-writer']),
    featureKey: FEATURE_KEYS.MANUAL_WRITER,
    label: FEATURE_LABELS['manual-writer'],
  },
  {
    paths: new Set(['/manual-management']),
    featureKey: FEATURE_KEYS.MANUAL_MANAGEMENT,
    label: 'Manual Control',
  },
  {
    paths: new Set(['/form-337']),
    featureKey: FEATURE_KEYS.FORM_337,
    label: FEATURE_LABELS['form-337'],
  },
  {
    paths: new Set(['/dct-compliance']),
    featureKey: FEATURE_KEYS.DCT_COMPLIANCE,
    label: FEATURE_LABELS['dct-compliance'],
  },
  {
    paths: new Set(['/library']),
    featureKey: FEATURE_KEYS.LIBRARY,
    label: FEATURE_LABELS['library'],
  },
  {
    paths: new Set(['/guided-audit']),
    featureKey: FEATURE_KEYS.GUIDED_AUDIT,
    label: FEATURE_LABELS['guided-audit'],
  },
  {
    paths: new Set(['/checklists']),
    featureKey: FEATURE_KEYS.CHECKLISTS,
    label: FEATURE_LABELS['checklists'],
  },
  {
    paths: new Set(['/review']),
    featureKey: FEATURE_KEYS.PAPERWORK_REVIEW,
    label: FEATURE_LABELS['paperwork-review'],
  },
  {
    paths: new Set(['/audit']),
    featureKey: FEATURE_KEYS.AUDIT_SIMULATION,
    label: FEATURE_LABELS['audit-simulation'],
  },
  {
    paths: new Set(['/entity-issues']),
    featureKey: FEATURE_KEYS.ENTITY_ISSUES,
    label: FEATURE_LABELS['entity-issues'],
  },
  {
    paths: new Set(['/report']),
    featureKey: FEATURE_KEYS.REPORT_BUILDER,
    label: FEATURE_LABELS['report-builder'],
  },
  {
    paths: new Set(['/revisions']),
    featureKey: FEATURE_KEYS.REVISIONS,
    label: FEATURE_LABELS['revisions'],
  },
  {
    paths: new Set(['/schedule', '/compliance-report']),
    featureKey: FEATURE_KEYS.SCHEDULE,
    label: FEATURE_LABELS['schedule'],
  },
  {
    paths: new Set(['/analytics']),
    featureKey: FEATURE_KEYS.ANALYTICS,
    label: FEATURE_LABELS['analytics'],
  },
  {
    paths: new Set(['/analysis']),
    featureKey: FEATURE_KEYS.ANALYSIS,
    label: FEATURE_LABELS['analysis'],
  },
];

export const PRIMARY_HOME_CTAS = [
  { path: '/guided-audit', label: 'Guided Audit', description: 'Start audit prep' },
  { path: '/library', label: 'Library', description: 'Manuals and evidence' },
  { path: '/quality-command-center', label: 'Quality & Compliance', description: 'See readiness' },
] as const;
