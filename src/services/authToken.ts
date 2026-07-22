/**
 * Bridge so plain (non-React) service modules can attach the current Clerk
 * session token to requests hitting our serverless Claude proxy. A React
 * component registers Clerk's `getToken` via `setClerkTokenGetter`; services
 * call `getClerkToken()` to read it.
 *
 * Uses the "convex" JWT template — the same token Convex auth already trusts,
 * which the /api/claude guard verifies with audience "convex".
 */
import { captureMessage } from './sentry';

export type TokenGetterOptions = { skipCache?: boolean };
type TokenGetter = (opts?: TokenGetterOptions) => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setClerkTokenGetter(fn: TokenGetter | null): void {
  tokenGetter = fn;
}

export async function getClerkToken(opts?: TokenGetterOptions): Promise<string | null> {
  if (tokenGetter) {
    try {
      const token = await tokenGetter(opts);
      // A null token while Clerk believes it's signed in means the session
      // token could not be minted — the classic precursor to a silent sign-out.
      if (!token) {
        captureMessage('auth: clerk token getter returned null', {
          skipCache: Boolean(opts?.skipCache),
          clerkSignedIn: readClerkSignedIn(),
          path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        });
      }
      return token;
    } catch (err) {
      captureMessage('auth: clerk token getter threw', {
        skipCache: Boolean(opts?.skipCache),
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        clerkSignedIn: readClerkSignedIn(),
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
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
    } catch (err) {
      captureMessage('auth: clerk window-fallback getToken threw', {
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      return null;
    }
  }
  return null;
}

/** Best-effort read of Clerk's current signed-in state for diagnostic context. */
function readClerkSignedIn(): boolean | undefined {
  const clerk = typeof window !== 'undefined' ? (window as any).Clerk : undefined;
  if (!clerk) return undefined;
  return Boolean(clerk.session);
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
