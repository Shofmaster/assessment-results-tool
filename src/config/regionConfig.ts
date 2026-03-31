/**
 * Geographic region configuration for KB document filtering.
 * Documents tagged with a region are only included when that region is selected.
 * "all" means the document applies regardless of region selection.
 */

export const REGIONS = [
  { id: 'all',  label: 'All Regions',  short: 'ALL',  color: 'text-white/70' },
  { id: 'us',   label: 'United States (FAA)', short: 'US',   color: 'text-blue-400' },
  { id: 'easa', label: 'EASA (Europe)', short: 'EASA', color: 'text-amber-400' },
  { id: 'icao', label: 'ICAO (International)', short: 'ICAO', color: 'text-emerald-400' },
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

export const DEFAULT_REGION: RegionId = 'all';

export function getRegionLabel(regionId: string | undefined): string {
  return REGIONS.find(r => r.id === regionId)?.label ?? 'All Regions';
}

export function getRegionShort(regionId: string | undefined): string {
  return REGIONS.find(r => r.id === regionId)?.short ?? 'ALL';
}

export function getRegionColor(regionId: string | undefined): string {
  return REGIONS.find(r => r.id === regionId)?.color ?? 'text-white/70';
}

/** Returns true if a document's region matches the active filter. */
export function regionMatches(docRegion: string | undefined, activeRegion: RegionId): boolean {
  // "all" filter means show everything; "all" doc region means it matches any filter
  if (activeRegion === 'all') return true;
  if (!docRegion || docRegion === 'all') return true;
  return docRegion === activeRegion;
}
