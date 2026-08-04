import { useEffect, useState } from 'react';

/** How long to wait for Convex auth + the user row before showing the app anyway. */
export const DB_USER_WAIT_MS = 12_000;

type Args = {
  /** Clerk's view of the session. */
  isSignedIn: boolean | undefined;
  /** Convex's view of the session, which settles slightly after Clerk's. */
  isAuthenticated: boolean;
  /** The Convex users row; `undefined` while loading, `null` when absent. */
  dbUser: unknown;
  /** Overridable for tests. */
  timeoutMs?: number;
};

/**
 * Whether the Convex user-row wait has timed out (show a retry UI — do not open the app).
 *
 * Convex auth and the user-row lookup can both settle after Clerk reports a session,
 * and either can flap. Blocking forever risks an indefinite spinner; opening the app
 * without a user row would skip the approval gate. So we wait a bounded time, then
 * signal timeout for a recovery screen.
 *
 * "Not waiting" is derived rather than stored: signed out, or signed in with the row
 * resolved, both mean there is nothing to wait for. Only the timeout itself needs
 * state, and it resets whenever a fresh wait begins so a previous timeout cannot make
 * the next one report instantly.
 */
export function useProceedWithoutDbUser({
  isSignedIn,
  isAuthenticated,
  dbUser,
  timeoutMs = DB_USER_WAIT_MS,
}: Args): boolean {
  const hasDbUser = dbUser !== null && dbUser !== undefined && isAuthenticated;
  const waiting = Boolean(isSignedIn) && !hasDbUser;

  const [timedOut, setTimedOut] = useState(false);

  // Starting a new wait clears any earlier timeout. Adjusted during render so a
  // stale `true` is never returned for the new wait, not even for one pass.
  const [prevWaiting, setPrevWaiting] = useState(waiting);
  if (prevWaiting !== waiting) {
    setPrevWaiting(waiting);
    if (waiting) setTimedOut(false);
  }

  useEffect(() => {
    if (!waiting) return;
    const id = window.setTimeout(() => {
      console.warn(
        '[AuthGate] Convex auth/user lookup timed out; holding for retry instead of opening the app without an approval check.',
      );
      setTimedOut(true);
    }, timeoutMs);
    return () => window.clearTimeout(id);
  }, [waiting, timeoutMs]);

  return waiting && timedOut;
}
