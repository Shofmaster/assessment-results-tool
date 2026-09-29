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

/**
 * Operator-facing text when the app server (Vercel function or self-host
 * process) has no service token. Fail closed: callers must not fall back to
 * ANTHROPIC_API_KEY, or every tenant's spend lands on the platform key.
 *
 * The value itself is never included. Generate one out of band; do not commit it.
 */
export function missingServiceTokenMessage(): string {
  return (
    'AI credential lookup is not configured: AI_CREDENTIAL_SERVICE_TOKEN is not set on this app server. ' +
    'Logbook Entry Review and other AI features stay off until the same secret exists in both places. ' +
    'Cloud: Vercel → Project → Settings → Environment Variables, and Convex (`npx convex env set AI_CREDENTIAL_SERVICE_TOKEN <value> --prod`). ' +
    'Desktop / self-host: the install .env (install.ps1 or bootstrap.mjs generates it) and the Convex backend env. ' +
    'Generate a value with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"`. ' +
    'Do not commit the token. See docs/ai-credentials.md.'
  );
}

/**
 * The Convex deployment rejected the lookup because its own copy of the token
 * is unset. Distinct from the app server missing it, so an operator does not
 * set the variable in only one of the two places.
 */
export function convexMissingServiceTokenMessage(): string {
  return (
    'AI credential lookup is not configured: AI_CREDENTIAL_SERVICE_TOKEN is not set in the Convex deployment. ' +
    'Set the same value the app server uses. ' +
    'Cloud: `npx convex env set AI_CREDENTIAL_SERVICE_TOKEN <value> --prod` (must match the Vercel env var). ' +
    'Desktop / self-host: re-run bootstrap.mjs so it pushes the .env value into Convex. ' +
    'Do not commit the token. See docs/ai-credentials.md.'
  );
}
