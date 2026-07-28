import { useEffect, useState } from 'react';

/**
 * A clock that ticks, for relative-time displays ("3 days ago", "~5 min left").
 *
 * Calling Date.now() while rendering is impure: the value changes between renders
 * React considers equivalent, and -- more visibly -- the display only refreshes when
 * some unrelated dependency happens to change, so a "5 min left" label can sit there
 * long after it stopped being true. Reading the time from state instead keeps render
 * pure and makes the value actually tick.
 *
 * Pass `null` when the value isn't on screen (no active run, nothing to count) to
 * skip the timer entirely rather than re-rendering for a label nobody is reading.
 */
export function useNow(intervalMs: number | null = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (intervalMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
