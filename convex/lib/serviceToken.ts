/**
 * Constant-time comparison for the shared server-to-server token.
 *
 * Node's crypto.timingSafeEqual is not available in the Convex runtime, so this
 * is a hand-rolled equivalent: it accumulates differences with XOR and always
 * walks the longer of the two strings, so the time taken does not depend on
 * WHERE the first mismatching character is. A plain `===` leaks that position
 * through timing, which is enough to recover a token byte by byte.
 */

export function timingSafeEqualStr(a: string, b: string): boolean {
  // Seed with the length difference so unequal lengths can never compare equal,
  // then walk the longer string regardless. charCodeAt past the end is NaN, and
  // `NaN || 0` folds to 0, which keeps the loop branch-free.
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * True when `provided` matches `expected`.
 *
 * An unset or blank expected value is NEVER a match: a deployment that forgot to
 * configure the token must reject every request rather than accept every one.
 * Callers are still responsible for reporting that case as a 503 (configuration
 * error) rather than a 401 (bad credential).
 */
export function verifyServiceToken(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const want = (expected || '').trim();
  const got = (provided || '').trim();
  if (want.length === 0 || got.length === 0) return false;
  return timingSafeEqualStr(got, want);
}

/** Header the api/ runtime presents the token in. */
export const SERVICE_TOKEN_HEADER = 'x-aerogap-service-token';

/** Env var holding the shared token, in BOTH the Convex and api/ environments. */
export const SERVICE_TOKEN_ENV = 'AI_CREDENTIAL_SERVICE_TOKEN';
