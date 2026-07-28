import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from '../useNow';

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('starts at the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    const { result } = renderHook(() => useNow(1000));
    expect(result.current).toBe(Date.now());
  });

  it('advances as the interval fires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    const { result } = renderHook(() => useNow(1000));
    const start = result.current;

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(start + 3000);
  });

  it('does not tick when the interval is null', () => {
    // The opt-out matters: callers pass null when the value is off screen, and a
    // hook that ticked anyway would re-render the tree for a label nobody reads.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    const { result } = renderHook(() => useNow(null));
    const start = result.current;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(start);
  });

  it('stops ticking after unmount', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
