/**
 * Preset bundles for company feature policy (Company admin / platform admin).
 * `null` for agents or frameworks = all enabled (same semantics as Convex policy).
 */

import type { FeatureKey } from './featureKeys';
import { FEATURE_KEYS } from './featureKeys';

/** Core workflow for Chief Inspector / Quality Manager tenants (per product strategy). */
export const QM_CORE_ENABLED_FEATURES: FeatureKey[] = [
  FEATURE_KEYS.QUALITY_COMMAND_CENTER,
  FEATURE_KEYS.LIBRARY,
  FEATURE_KEYS.PAPERWORK_REVIEW,
  FEATURE_KEYS.ANALYSIS,
  FEATURE_KEYS.GUIDED_AUDIT,
  FEATURE_KEYS.ENTITY_ISSUES,
  FEATURE_KEYS.CHECKLISTS,
  FEATURE_KEYS.REVISIONS,
  FEATURE_KEYS.REPORT_BUILDER,
  /** Roster nav is gated with CARs in the app (same compliance toggle). */
  FEATURE_KEYS.SCHEDULE,
];

/** Optional add-ons not included in QM Core (enable per tenant). */
export const QM_CORE_EXCLUDED_FEATURES: FeatureKey[] = [
  FEATURE_KEYS.AUDIT_SIMULATION,
  FEATURE_KEYS.ANALYTICS,
  FEATURE_KEYS.MANUAL_WRITER,
  FEATURE_KEYS.MANUAL_MANAGEMENT,
  FEATURE_KEYS.FORM_337,
];

export type CompanyFeaturePresetId = 'qm-core' | 'full-platform';

export const COMPANY_FEATURE_PRESETS: Record<
  CompanyFeaturePresetId,
  {
    label: string;
    description: string;
    enabledFeatures: FeatureKey[] | null;
    /** false = logbook modules off for pure QM SKU */
    logbookEnabled: boolean;
  }
> = {
  'qm-core': {
    label: 'QM Core',
    description:
      'Library, paperwork review, analysis, guided audit, CARs, checklists, revisions, reports, roster, schedule, and Quality command center. Logbook/Form 337/manual tools off; audit simulation and analytics off.',
    enabledFeatures: QM_CORE_ENABLED_FEATURES,
    logbookEnabled: false,
  },
  'full-platform': {
    label: 'Full platform',
    description: 'All features enabled for all users of this company (same as empty policy defaults).',
    enabledFeatures: null,
    logbookEnabled: true,
  },
};
