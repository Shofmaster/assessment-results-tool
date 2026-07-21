/**
 * Lightweight Ask hot-path timings (dev only). Logs retrieval / Claude wall time
 * so we can verify latency wins without a full telemetry stack.
 */
const ENABLED =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

export function askPerfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function askPerfLog(label: string, startMs: number, extra?: Record<string, unknown>): void {
  if (!ENABLED) return;
  const ms = Math.round(askPerfNow() - startMs);
  if (extra && Object.keys(extra).length > 0) {
    console.debug(`[ask-perf] ${label}: ${ms}ms`, extra);
  } else {
    console.debug(`[ask-perf] ${label}: ${ms}ms`);
  }
}
