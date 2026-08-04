import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProceedWithoutDbUser, DB_USER_WAIT_MS } from '../useProceedWithoutDbUser';

/**
 * This gate decides whether AuthGate shows a retry screen after a stuck Convex user
 * lookup. Cases below: never time out while there is nothing to wait for; signal
 * timeout once the wait is genuinely stuck (AuthGate shows retry — not the app).
 */

type Props = Parameters<typeof useProceedWithoutDbUser>[0];

const SIGNED_OUT: Props = { isSignedIn: false, isAuthenticated: false, dbUser: undefined };
const WAITING: Props = { isSignedIn: true, isAuthenticated: false, dbUser: undefined };
const RESOLVED: Props = { isSignedIn: true, isAuthenticated: true, dbUser: { _id: 'u1' } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useProceedWithoutDbUser', () => {
  it('does not proceed while signed out, however long it waits', () => {
    const { result } = renderHook(() => useProceedWithoutDbUser(SIGNED_OUT));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS * 3);
    });

    expect(result.current).toBe(false);
  });

  it('does not proceed once the user row has resolved', () => {
    const { result } = renderHook(() => useProceedWithoutDbUser(RESOLVED));
    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS * 3);
    });
    expect(result.current).toBe(false);
  });

  it('holds while the lookup is still in flight, then proceeds once it times out', () => {
    const { result } = renderHook(() => useProceedWithoutDbUser(WAITING));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS - 1);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('stops proceeding as soon as the user row arrives after a timeout', () => {
    const { result, rerender } = renderHook((props) => useProceedWithoutDbUser(props), {
      initialProps: WAITING,
    });

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS);
    });
    expect(result.current).toBe(true);

    rerender(RESOLVED);
    expect(result.current).toBe(false);
  });

  it('does not report a stale timeout against a fresh wait', () => {
    // Regression guard: sign in, time out, sign out, sign back in. The second wait
    // must start clean rather than inheriting the first wait's timeout, which would
    // skip the loading screen instantly.
    const { result, rerender } = renderHook((props) => useProceedWithoutDbUser(props), {
      initialProps: WAITING,
    });

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS);
    });
    expect(result.current).toBe(true);

    rerender(SIGNED_OUT);
    expect(result.current).toBe(false);

    rerender(WAITING);
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS - 1);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('treats a null user row as still waiting', () => {
    // Convex returns null for "no row yet", which is not the same as resolved.
    const { result } = renderHook(() =>
      useProceedWithoutDbUser({ isSignedIn: true, isAuthenticated: true, dbUser: null }),
    );
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS);
    });
    expect(result.current).toBe(true);
  });

  it('keeps waiting when Convex auth has not caught up with Clerk', () => {
    // dbUser present but isAuthenticated false: Convex has not accepted the token yet.
    const { result } = renderHook(() =>
      useProceedWithoutDbUser({ isSignedIn: true, isAuthenticated: false, dbUser: { _id: 'u1' } }),
    );
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(DB_USER_WAIT_MS);
    });
    expect(result.current).toBe(true);
  });

  it('cancels the timer on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderHook(() => useProceedWithoutDbUser(WAITING));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
