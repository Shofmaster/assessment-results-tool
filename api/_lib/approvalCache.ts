/**
 * Short-lived in-process cache for the "is this account approved?" verdict.
 *
 * Without it, every authenticated AI request pays a Convex round trip in
 * verifyRequestAuth just to re-read a field that changes maybe twice in an
 * account's lifetime. The credential lookup next to it is already cached
 * (api/_lib/aiCredentialCache.ts); this closes the other half.
 *
 * WHY THE TTL IS 10s RATHER THAN THE CREDENTIAL CACHE'S 60s
 * ---------------------------------------------------------
 * This cache is an access-control decision, not a performance detail. An admin
 * who rejects an account expects that account to stop spending, and every
 * second of a cached "approved" is a second of spend they thought they had
 * stopped. Ten seconds is short enough to read as immediate to a human doing
 * the rejecting, and still removes >90% of the round trips under any real
 * request rate. The same TTL bounds the other direction - a freshly approved
 * user waiting out a cached "blocked" - which is merely annoying rather than
 * costly, so one TTL serves both. Do not raise it to match the credential TTL:
 * the two caches hold different kinds of answer.
 *
 * On self-host this is the ONLY bound. The Express process in selfhost/server
 * runs for weeks with no natural recycling, unlike a Vercel lambda.
 *
 * WHAT IS DELIBERATELY NOT CACHED
 * -------------------------------
 * Only a verdict Convex actually returned is stored. A failed check - Convex
 * unreachable, timed out, unconfigured - is NOT a verdict and is never cached,
 * so each request during an outage re-checks and fails closed on its own. The
 * alternative would let one transient error pin an outage open for the TTL.
 */

/** A determinate answer from Convex. Failures are not verdicts - see above. */
export type ApprovalVerdict = 'approved' | 'blocked';

interface Entry {
  verdict: ApprovalVerdict;
  expiresAtMs: number;
}

const TTL_MS = 10_000;

/** Bound memory. Entries are tiny, but one process must not grow unbounded. */
const MAX_ENTRIES = 1_000;

const cache = new Map<string, Entry>();
let writes = 0;

function sweep(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAtMs <= now) cache.delete(key);
  }
}

/**
 * Keyed on the Clerk user id, not the bearer token: Clerk rotates short-lived
 * session JWTs, so a token-keyed cache would miss on nearly every request.
 */
export function getCachedApproval(userId: string): ApprovalVerdict | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.verdict;
}

export function setCachedApproval(userId: string, verdict: ApprovalVerdict): void {
  const now = Date.now();

  writes += 1;
  if (writes % 100 === 0) sweep(now);

  if (!cache.has(userId) && cache.size >= MAX_ENTRIES) {
    // Map preserves insertion order, so the first key is the oldest insertion.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  cache.set(userId, { verdict, expiresAtMs: now + TTL_MS });
}

/**
 * Forget one user's verdict. Not currently called on the request path - it
 * exists so an admin-side revocation can be made to take effect immediately
 * within a single process if that is ever wired up.
 */
export function invalidateCachedApproval(userId: string): void {
  cache.delete(userId);
}

/** Test seam. */
export function _resetApprovalCache(): void {
  cache.clear();
  writes = 0;
}

export const _APPROVAL_CACHE_LIMITS = { TTL_MS, MAX_ENTRIES } as const;
