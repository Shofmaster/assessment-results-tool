import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useAppSignOut } from './useAppSignOut';

/** Sign the user out after this long with no recognized user activity. */
const IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours
/** Show the "you're about to be signed out" warning this long before the cutoff. */
const WARN_MS = 60 * 1000; // 1 minute
/** How often the timer checks elapsed idle time. */
const CHECK_INTERVAL_MS = 15 * 1000;
/** Don't reset the idle clock more than once per this window (cheap event handling). */
const ACTIVITY_THROTTLE_MS = 5 * 1000;
/**
 * Cross-tab shared activity timestamp. Clerk's signOut() ends the session in
 * EVERY tab, so a forgotten background tab must not sign out a user who is
 * actively working in another tab.
 */
const SHARED_ACTIVITY_KEY = 'aerogap_last_activity_v1';

/**
 * Window-level events that bubble (or target the window). Nested panel scroll
 * does not bubble, so scroll/wheel/touchmove are handled separately in capture
 * on `document` — see the activity effect below.
 */
const WINDOW_ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'pointerdown',
  'keydown',
  'touchstart',
] as const;

/** Capture-phase on document so overflow panels inside the app count as use. */
const DOCUMENT_CAPTURE_ACTIVITY_EVENTS = [
  'scroll',
  'wheel',
  'touchmove',
] as const;

function readSharedActivity(): number {
  try {
    const v = Number(localStorage.getItem(SHARED_ACTIVITY_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(ts: number): void {
  try {
    localStorage.setItem(SHARED_ACTIVITY_KEY, String(ts));
  } catch {
    /* quota / private mode — per-tab tracking still works */
  }
}

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
 *
 * Activity includes nested-panel scroll/wheel (document capture) as well as
 * pointer and keyboard input. Timestamps are shared across tabs (localStorage)
 * because Clerk sign-out is session-wide. Sign-out requires two consecutive
 * over-limit ticks: after system sleep / timer throttling the first tick can
 * see hours of "idle" the instant the machine wakes, so we arm + warn first
 * and give the returning user's input (or another tab's activity) a chance to
 * cancel.
 */
export function useIdleLogout(): IdleLogoutState {
  const { isSignedIn } = useAuth();
  const signOutWithCleanup = useAppSignOut();

  const lastActivityRef = useRef(Date.now());
  const lastResetRef = useRef(0);
  const lastSharedWriteRef = useRef(0);
  /** Sign-out deadline once armed after an over-limit tick (null = not armed). */
  const armedDeadlineRef = useRef<number | null>(null);
  const signingOutRef = useRef(false);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(WARN_MS / 1000));

  const resetActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastSharedWriteRef.current = now;
    armedDeadlineRef.current = null;
    writeSharedActivity(now);
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
        // Still bump the raw activity time so the idle clock is accurate.
        lastActivityRef.current = now;
        // Keep the cross-tab timestamp fresh, but not on every mousemove.
        if (now - lastSharedWriteRef.current >= ACTIVITY_THROTTLE_MS) {
          lastSharedWriteRef.current = now;
          writeSharedActivity(now);
        }
        return;
      }
      lastResetRef.current = now;
      resetActivity();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resetActivity();
    };
    for (const evt of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    // Nested overflow panels scroll their own element; `scroll` does not bubble,
    // so capture on document is required for "I'm reading this page" to count.
    for (const evt of DOCUMENT_CAPTURE_ACTIVITY_EVENTS) {
      document.addEventListener(evt, onActivity, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      for (const evt of WINDOW_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      for (const evt of DOCUMENT_CAPTURE_ACTIVITY_EVENTS) {
        document.removeEventListener(evt, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isSignedIn, resetActivity]);

  // Single interval that drives the warning + sign-out.
  useEffect(() => {
    if (!isSignedIn) return;
    const startedAt = Date.now();
    lastActivityRef.current = startedAt;
    writeSharedActivity(startedAt);
    armedDeadlineRef.current = null;
    signingOutRef.current = false;
    const id = window.setInterval(() => {
      const now = Date.now();
      const lastActivity = Math.max(lastActivityRef.current, readSharedActivity());
      lastActivityRef.current = lastActivity;
      const idle = now - lastActivity;
      if (idle >= IDLE_MS) {
        // After sleep / timer throttling, the first tick can overshoot the idle
        // limit by hours. Arm with the FULL advertised warning window so the
        // returning user gets the same 60 seconds as the normal countdown path.
        if (armedDeadlineRef.current === null) {
          armedDeadlineRef.current = now + WARN_MS;
          setShowWarning(true);
          setSecondsLeft(Math.ceil(WARN_MS / 1000));
          return;
        }
        if (now < armedDeadlineRef.current) {
          setShowWarning(true);
          setSecondsLeft(Math.max(0, Math.ceil((armedDeadlineRef.current - now) / 1000)));
          return;
        }
        if (signingOutRef.current) return;
        signingOutRef.current = true;
        void signOutWithCleanup();
        return;
      }
      armedDeadlineRef.current = null;
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
