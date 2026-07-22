/**
 * Lightweight Drive-search hot-path timings (dev only). Logs index cache hits,
 * Drive download+parse, embed, rank and passage-fetch wall time so we can verify
 * latency wins without a telemetry stack. Mirrors askPerf.ts; logs only — nothing
 * is persisted.
 */
const ENABLED =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

export function searchPerfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function searchPerfLog(label: string, startMs: number, extra?: Record<string, unknown>): void {
  if (!ENABLED) return;
  const ms = Math.round(searchPerfNow() - startMs);
  if (extra && Object.keys(extra).length > 0) {
    console.debug(`[search-perf] ${label}: ${ms}ms`, extra);
  } else {
    console.debug(`[search-perf] ${label}: ${ms}ms`);
  }
}

/** Log a discrete event (no duration), dev only. */
export function searchPerfEvent(label: string, extra?: Record<string, unknown>): void {
  if (!ENABLED) return;
  if (extra && Object.keys(extra).length > 0) {
    console.debug(`[search-perf] ${label}`, extra);
  } else {
    console.debug(`[search-perf] ${label}`);
  }
}
