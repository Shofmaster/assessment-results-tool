/** Section ids for the Fleet page rail, in display order. */
export const FLEET_TABS = ['aircraft', 'types', 'discrepancies', 'monitoring'] as const;

export type FleetTab = (typeof FLEET_TABS)[number];

export const DEFAULT_FLEET_TAB: FleetTab = 'aircraft';

/**
 * Resolves the `?tab=` search param to a section id. Unknown or absent values
 * fall back to the default so the many bare `/fleet` deep links across the app
 * still land somewhere useful.
 */
export function resolveFleetTab(raw: string | null | undefined): FleetTab {
  return FLEET_TABS.includes(raw as FleetTab) ? (raw as FleetTab) : DEFAULT_FLEET_TAB;
}
