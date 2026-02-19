import { useEffect, type RefObject } from 'react';

/**
 * On mount (e.g. after a view/route transition), move focus to the first
 * heading (h1 or h2) inside the container so keyboard and screen reader
 * users start at the new view's title.
 */
export function useFocusViewHeading(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = containerRef.current?.querySelector('h1, h2') as HTMLElement | undefined;
    if (el) {
      el.tabIndex = -1;
      el.focus({ preventScroll: false });
    }
  }, []); // run on mount (view transition)
}
