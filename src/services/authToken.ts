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

/**
 * The project the user is currently working in, if any.
 *
 * Sent to our proxies as an X-AeroGap-Project-Id HINT so the server can bill the
 * company that owns that project rather than guessing from the user's
 * memberships. Registered here rather than threaded through four request bodies
 * (and their validators) because every AI call already funnels through
 * authedJsonHeaders().
 *
 * It is only a hint: the server re-authorizes it against the caller's live
 * memberships and silently drops it if the user has no access, so a stale value
 * in a long-open tab degrades to the default rather than failing or leaking.
 */
type ProjectIdGetter = () => string | null;

let projectIdGetter: ProjectIdGetter | null = null;

export function setActiveProjectIdGetter(fn: ProjectIdGetter | null): void {
  projectIdGetter = fn;
}

export const PROJECT_HINT_HEADER = 'X-AeroGap-Project-Id';

function activeProjectIdHeaderValue(): string | null {
  if (!projectIdGetter) return null;
  try {
    const value = projectIdGetter();
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    // A hint is never worth failing a request over.
    return null;
  }
}

/**
 * Rate-limit diagnostic reports so a burst of failing calls (e.g. a render loop
 * retrying requests while signed out) doesn't flood the console/Sentry and bury
 * the one occurrence that matters.
 */
const lastDiagAt = new Map<string, number>();
const DIAG_MIN_INTERVAL_MS = 60_000;

function captureAuthDiag(message: string, extra?: Record<string, unknown>): void {
  const now = Date.now();
  const last = lastDiagAt.get(message) ?? 0;
  if (now - last < DIAG_MIN_INTERVAL_MS) return;
  lastDiagAt.set(message, now);
  captureMessage(message, extra);
}

export async function getClerkToken(opts?: TokenGetterOptions): Promise<string | null> {
  if (tokenGetter) {
    try {
      const token = await tokenGetter(opts);
      // A null token while Clerk believes it's signed in means the session
      // token could not be minted — the classic precursor to a silent sign-out.
      // A null while signed out is expected; logging it would drown the signal.
      if (!token && readClerkSignedIn() === true) {
        captureAuthDiag('auth: clerk token getter returned null while signed in', {
          skipCache: Boolean(opts?.skipCache),
          path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        });
      }
      return token;
    } catch (err) {
      captureAuthDiag('auth: clerk token getter threw', {
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
      captureAuthDiag('auth: clerk window-fallback getToken threw', {
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
  const projectId = activeProjectIdHeaderValue();
  if (projectId) headers[PROJECT_HINT_HEADER] = projectId;
  return headers;
}
