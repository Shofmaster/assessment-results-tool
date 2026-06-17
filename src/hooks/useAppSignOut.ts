import { useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useCancelAllActiveRuns } from './useConvexData';
import { clearLocalSessionData } from '../services/sessionCleanup';

/**
 * Centralized sign-out. Stops the user's in-flight server-orchestrated work
 * (traceability runs keep scheduling paid Claude batches even after the tab is
 * gone), wipes session-sensitive local data, then signs out of Clerk.
 *
 * Each step is best-effort: a failure cancelling runs or clearing local data
 * must never trap the user in a half-signed-out state, so we always reach
 * `signOut()`. Used by the sidebar, settings, the pending-approval screen, and
 * the idle auto-logout.
 */
export function useAppSignOut() {
  const { signOut } = useAuth();
  const cancelAllActiveRuns = useCancelAllActiveRuns();

  return useCallback(async () => {
    try {
      await cancelAllActiveRuns({});
    } catch {
      // Server-side stall cron is the backstop if this fails.
    }
    try {
      await clearLocalSessionData();
    } catch {
      // clearLocalSessionData already swallows its own errors; belt-and-braces.
    }
    await signOut();
  }, [cancelAllActiveRuns, signOut]);
}
