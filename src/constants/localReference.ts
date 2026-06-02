/**
 * Manufacturer copyrighted technical material that must NOT be persisted as a copy.
 * Documents in these categories are referenced from a customer-controlled source
 * (local disk / mapped share / HTTP server) and re-read transiently per request.
 */
export const LOCAL_REFERENCE_CATEGORIES = [
  'maintenance_manual',
  'parts_catalog',
  'wiring_diagram',
] as const;

export type LocalReferenceCategory = (typeof LOCAL_REFERENCE_CATEGORIES)[number];

export function isLocalReferenceCategory(category: string): category is LocalReferenceCategory {
  return (LOCAL_REFERENCE_CATEGORIES as readonly string[]).includes(category);
}
