/**
 * Copyrighted third-party material that must NOT be persisted as a copy by default.
 * Documents in these categories are referenced from a customer-controlled source
 * (local disk / mapped share / HTTP server) and re-read transiently per request.
 *
 * Two sub-groups, each gated by its own AeroGap-admin per-company escape hatch:
 *  - MANUFACTURER_REFERENCE_CATEGORIES → companyFeaturePolicies.allowManufacturerDocStorage
 *  - STANDARDS_REFERENCE_CATEGORIES    → companyFeaturePolicies.allowStandardsStorage
 */
export const MANUFACTURER_REFERENCE_CATEGORIES = [
  'maintenance_manual',
  'parts_catalog',
  'wiring_diagram',
] as const;

/**
 * Copyrighted compliance STANDARDS (IS-BAO/ICAO, AS9100/AS9110, IS-BAH, ARGUS/Wyvern).
 * Each licensee supplies its own copy; we never persist or redistribute the text.
 */
export const STANDARDS_REFERENCE_CATEGORIES = [
  'isbao_standard',
  'as9100_standard',
  'isbah_standard',
  'audit_criteria',
] as const;

export const LOCAL_REFERENCE_CATEGORIES = [
  ...MANUFACTURER_REFERENCE_CATEGORIES,
  ...STANDARDS_REFERENCE_CATEGORIES,
] as const;

export type ManufacturerReferenceCategory = (typeof MANUFACTURER_REFERENCE_CATEGORIES)[number];
export type StandardsReferenceCategory = (typeof STANDARDS_REFERENCE_CATEGORIES)[number];
export type LocalReferenceCategory = (typeof LOCAL_REFERENCE_CATEGORIES)[number];

export function isLocalReferenceCategory(category: string): category is LocalReferenceCategory {
  return (LOCAL_REFERENCE_CATEGORIES as readonly string[]).includes(category);
}

export function isManufacturerReferenceCategory(category: string): category is ManufacturerReferenceCategory {
  return (MANUFACTURER_REFERENCE_CATEGORIES as readonly string[]).includes(category);
}

export function isStandardsReferenceCategory(category: string): category is StandardsReferenceCategory {
  return (STANDARDS_REFERENCE_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Maps a standards-reference category to the auditor agent whose knowledge base it
 * feeds, so per-company licensed copies can be routed to the right agent when the
 * no-copy consuming path is wired up.
 */
export const STANDARDS_CATEGORY_TO_AGENT: Record<StandardsReferenceCategory, string> = {
  isbao_standard: 'isbao-auditor',
  as9100_standard: 'as9100-auditor',
  isbah_standard: 'isbao-auditor',
  audit_criteria: 'safety-auditor',
};
