import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useAppSignOut } from './useAppSignOut';

/** Sign the user out after this long with no mouse/keyboard activity. */
const IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours
/** Show the "you're about to be signed out" warning this long before the cutoff. */
const WARN_MS = 60 * 1000; // 1 minute
/** How often the timer checks elapsed idle time. */
const CHECK_INTERVAL_MS = 15 * 1000;
/** Don't reset the idle clock more than once per this window (cheap event handling). */
const ACTIVITY_THROTTLE_MS = 5 * 1000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
] as const;

export interface IdleLogoutState {
  /** True while the pre-logout warning should be shown. */
  showWarning: boolean;
  /** Whole seconds remaining before auto sign-out (only meaningful while warning). */
  secondsLeft: number;
  /** Dismiss the warning and reset the idle clock. */
  stayActive: () => void;
}

/**
 * Auto-logout after 2 hours of inactivity, with a 1-minute warning the user can
 * dismiss. Mounted inside the authenticated tree (AuthGate children), so it only
 * runs while signed in. Sign-out routes through `useAppSignOut`, which also
 * cancels any in-flight traceability runs so server work stops with the session.
 */
export function useIdleLogout(): IdleLogoutState {
  const { isSignedIn } = useAuth();
  const signOutWithCleanup = useAppSignOut();

  const lastActivityRef = useRef(Date.now());
  const lastResetRef = useRef(0);
  const signingOutRef = useRef(false);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(WARN_MS / 1000));

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning((prev) => (prev ? false : prev));
  }, []);

  const stayActive = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  // Throttled activity listeners — a brushed mouse shouldn't write state 100×/sec.
  useEffect(() => {
    if (!isSignedIn) return;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < ACTIVITY_THROTTLE_MS) {
        // Still bump the raw activity time so the idle clock is accurate, but
        // skip the (potential) state update churn.
        lastActivityRef.current = now;
        return;
      }
      lastResetRef.current = now;
      resetActivity();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resetActivity();
    };
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isSignedIn, resetActivity]);

  // Single interval that drives the warning + sign-out.
  useEffect(() => {
    if (!isSignedIn) return;
    lastActivityRef.current = Date.now();
    signingOutRef.current = false;
    const id = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_MS) {
        if (signingOutRef.current) return;
        signingOutRef.current = true;
        void signOutWithCleanup();
        return;
      }
      if (idle >= IDLE_MS - WARN_MS) {
        setShowWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_MS - idle) / 1000)));
      } else {
        setShowWarning((prev) => (prev ? false : prev));
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isSignedIn, signOutWithCleanup]);

  return { showWarning, secondsLeft, stayActive };
}
