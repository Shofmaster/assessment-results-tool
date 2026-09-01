/**
 * Short-lived in-process cache for resolved AI provider keys.
 *
 * Without it every AI request pays an extra network round trip to Convex just
 * to learn which key to use. Modelled on api/_lib/rateLimit.ts: a bounded Map in
 * process memory, so it is per warm instance and never shared or persisted.
 *
 * NEVER persist these values - not to disk, not to Convex, not to a log line.
 * They are live customer API keys.
 *
 * On self-host this matters more than on Vercel. Lambdas recycle constantly, so
 * a stale entry there is short-lived by accident; the Express process in
 * selfhost/server runs for weeks, and the TTL below is the ONLY thing bounding
 * how long a rotated key keeps being used. Do not raise it.
 */

export interface CachedCredential {
  apiKey: string;
  source: 'company' | 'install' | 'env';
  companyId?: string;
}

interface Entry {
  value: CachedCredential | null;
  expiresAtMs: number;
}

/** Hits: long enough to matter, short enough that a rotation self-heals fast. */
const HIT_TTL_MS = 60_000;
/**
 * Misses expire sooner: the moment right after an admin pastes their first key
 * is exactly when a stale "no credential" answer is most annoying.
 */
const MISS_TTL_MS = 15_000;

/** Bound memory. Entries are tiny, but one process must not grow unbounded. */
const MAX_ENTRIES = 500;

const cache = new Map<string, Entry>();
let writes = 0;

/**
 * Keyed on the resolution INPUTS, not the resolved company - resolving the
 * company is the round trip we are avoiding. A 50-user company therefore holds
 * up to 50 entries for one key, which is fine at this size.
 */
export function credentialCacheKey(
  provider: string,
  userId: string,
  projectId?: string,
): string {
  return `${provider}|${userId}|${projectId || '-'}`;
}

function sweep(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAtMs <= now) cache.delete(key);
  }
}

export function getCachedCredential(key: string): { hit: boolean; value: CachedCredential | null } {
  const entry = cache.get(key);
  if (!entry) return { hit: false, value: null };
  if (entry.expiresAtMs <= Date.now()) {
    cache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

export function setCachedCredential(key: string, value: CachedCredential | null): void {
  const now = Date.now();

  writes += 1;
  if (writes % 100 === 0) sweep(now);

  if (!cache.has(key) && cache.size >= MAX_ENTRIES) {
    // Map preserves insertion order, so the first key is the oldest insertion.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  cache.set(key, {
    value,
    expiresAtMs: now + (value ? HIT_TTL_MS : MISS_TTL_MS),
  });
}

/**
 * Drop one entry. Call this when a provider rejects the key with 401/403 and
 * then retry ONCE - that is what turns "we rotated the key and everything broke
 * for a minute" into a single transparent retry.
 */
export function invalidateCachedCredential(key: string): void {
  cache.delete(key);
}

/** Test seam. */
export function _resetCredentialCache(): void {
  cache.clear();
  writes = 0;
}

export const _CACHE_LIMITS = { HIT_TTL_MS, MISS_TTL_MS, MAX_ENTRIES } as const;
