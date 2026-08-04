/** Shared display helpers for the Fleet page and the dashboard AD/SB card. */

/** Times/cycles/landings for a table cell. Falls back to an em dash. */
export function formatNumber(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Compact "3d ago" style relative time for last-checked / last-synced stamps. */
export function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'never';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
