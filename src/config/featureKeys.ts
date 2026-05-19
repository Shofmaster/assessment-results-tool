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

  /** Chief Inspector / QM hub: readiness dashboard + audit prep workflow links */
  QUALITY_COMMAND_CENTER: 'quality-command-center',

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
  /** FAA SAS DCT traceability, revision checks, and compliance vs manuals */
  DCT_COMPLIANCE: 'dct-compliance',
  /** Feature-flag gate for certificate profile normalization engine */
  PROFILE_ENGINE_V2: 'profile-engine-v2',
  /** Feature-flag gate for profile-resolved checklist generation */
  PROFILE_AWARE_CHECKLISTS: 'profile-aware-checklists',
  /** Feature-flag gate for profile-resolved recurring scheduler */
  PROFILE_AWARE_SCHEDULER: 'profile-aware-scheduler',
  /** Feature-flag gate for profile-resolved report composition */
  PROFILE_AWARE_REPORTING: 'profile-aware-reporting',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

/** All feature keys in a flat array */
export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

/** Human-readable label for each feature key */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  'manual-writer': 'Manual Writer',
  'manual-management': 'Manual Management',
  'form-337': 'FAA Form 337',
  'quality-command-center': 'Quality & Compliance Hub',
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
  'dct-compliance': 'DCT Compliance',
  'profile-engine-v2': 'Profile Engine V2',
  'profile-aware-checklists': 'Profile-Aware Checklists',
  'profile-aware-scheduler': 'Profile-Aware Scheduler',
  'profile-aware-reporting': 'Profile-Aware Reporting',
};

/** Groups used by the admin Feature Toggles UI */
export const FEATURE_GROUPS: { label: string; keys: FeatureKey[] }[] = [
  {
    label: 'App Sections',
    keys: ['manual-writer', 'manual-management', 'form-337', 'quality-command-center'],
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
      'dct-compliance',
      'profile-engine-v2',
      'profile-aware-checklists',
      'profile-aware-scheduler',
      'profile-aware-reporting',
    ],
  },
];
