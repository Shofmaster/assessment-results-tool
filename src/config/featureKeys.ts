/**
 * Feature keys for per-user access control.
 *
 * null/undefined in userSettings.enabledFeatures = all features enabled (default).
 * An empty array [] = no features enabled.
 * A populated array = only those features are accessible.
 */

export const FEATURE_KEYS = {
  // ── App sections ──────────────────────────────────────────────────────────
  MANUAL_WRITER: 'manual-writer',
  MANUAL_MANAGEMENT: 'manual-management',
  FORM_337: 'form-337',

  // ── Audit sub-features ────────────────────────────────────────────────────
  AUDIT_SIMULATION: 'audit-simulation',
  GUIDED_AUDIT: 'guided-audit',
  CHECKLISTS: 'checklists',
  LIBRARY: 'library',
  PAPERWORK_REVIEW: 'paperwork-review',
  ANALYSIS: 'analysis',
  ENTITY_ISSUES: 'entity-issues',
  REVISIONS: 'revisions',
  SCHEDULE: 'schedule',
  ANALYTICS: 'analytics',
  REPORT_BUILDER: 'report-builder',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

/** All feature keys in a flat array */
export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

/** Human-readable label for each feature key */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  'manual-writer': 'Manual Writer',
  'manual-management': 'Manual Management',
  'form-337': 'FAA Form 337',
  'audit-simulation': 'Audit Simulation',
  'guided-audit': 'Guided Audit',
  'checklists': 'Checklists',
  'library': 'Document Library',
  'paperwork-review': 'Paperwork Review',
  'analysis': 'Analysis',
  'entity-issues': 'CARs & Issues',
  'revisions': 'Revision Tracker',
  'schedule': 'Inspection Schedule',
  'analytics': 'Analytics',
  'report-builder': 'Report Builder',
};

/** Groups used by the admin Feature Toggles UI */
export const FEATURE_GROUPS: { label: string; keys: FeatureKey[] }[] = [
  {
    label: 'App Sections',
    keys: ['manual-writer', 'manual-management', 'form-337'],
  },
  {
    label: 'Audit Sub-Features',
    keys: [
      'audit-simulation',
      'guided-audit',
      'checklists',
      'library',
      'paperwork-review',
      'analysis',
      'entity-issues',
      'revisions',
      'schedule',
      'analytics',
      'report-builder',
    ],
  },
];
