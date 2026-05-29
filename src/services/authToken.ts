/**
 * Bridge so plain (non-React) service modules can attach the current Clerk
 * session token to requests hitting our serverless Claude proxy. A React
 * component registers Clerk's `getToken` via `setClerkTokenGetter`; services
 * call `getClerkToken()` to read it.
 *
 * Uses the "convex" JWT template — the same token Convex auth already trusts,
 * which the /api/claude guard verifies with audience "convex".
 */
export type TokenGetterOptions = { skipCache?: boolean };
type TokenGetter = (opts?: TokenGetterOptions) => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setClerkTokenGetter(fn: TokenGetter | null): void {
  tokenGetter = fn;
}

export async function getClerkToken(opts?: TokenGetterOptions): Promise<string | null> {
  if (tokenGetter) {
    try {
      return await tokenGetter(opts);
    } catch {
      // fall through to global fallback
    }
  }
  // Fallback: Clerk attaches its instance to window when loaded.
  const clerk = typeof window !== 'undefined' ? (window as any).Clerk : undefined;
  if (clerk?.session?.getToken) {
    try {
      return await clerk.session.getToken({
        template: 'convex',
        skipCache: opts?.skipCache,
      });
    } catch {
      return null;
    }
  }
  return null;
}

/** Build request headers with the Clerk bearer token when available. */
export async function authedJsonHeaders(opts?: {
  forceRefresh?: boolean;
}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getClerkToken(opts?.forceRefresh ? { skipCache: true } : undefined);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
