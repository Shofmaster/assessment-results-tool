import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftSyncedTo } from '../useDraftSyncedTo';

describe('useDraftSyncedTo', () => {
  it('starts at the source value', () => {
    const { result } = renderHook(() => useDraftSyncedTo('faa-dct-traceability'));
    expect(result.current[0]).toBe('faa-dct-traceability');
  });

  it('keeps a local edit while the source is unchanged', () => {
    // The point of the draft: a user picking from a dropdown must not be undone by
    // an unrelated re-render.
    const { result, rerender } = renderHook((v: string) => useDraftSyncedTo(v), {
      initialProps: 'a',
    });

    act(() => result.current[1]('user-picked'));
    expect(result.current[0]).toBe('user-picked');

    rerender('a');
    expect(result.current[0]).toBe('user-picked');
  });

  it('resets the draft when the source changes', () => {
    const { result, rerender } = renderHook((v: string) => useDraftSyncedTo(v), {
      initialProps: 'a',
    });

    act(() => result.current[1]('user-picked'));
    rerender('b');

    expect(result.current[0]).toBe('b');
  });

  it('reports the new source value on the same pass it changes', () => {
    // An effect-based version would return the stale draft for one render first.
    const seen: string[] = [];
    const { rerender } = renderHook(
      (v: string) => {
        seen.push(useDraftSyncedTo(v)[0]);
      },
      { initialProps: 'a' },
    );

    rerender('b');
    expect(seen[seen.length - 1]).toBe('b');
    expect(seen).not.toContain('a-stale');
  });

  it('allows editing again after a source-driven reset', () => {
    const { result, rerender } = renderHook((v: string) => useDraftSyncedTo(v), {
      initialProps: 'a',
    });

    rerender('b');
    act(() => result.current[1]('edited-after-reset'));
    expect(result.current[0]).toBe('edited-after-reset');
  });

  it('supports updater functions', () => {
    const { result } = renderHook(() => useDraftSyncedTo(1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
  });

  it('treats a repeated identical source value as no change', () => {
    const { result, rerender } = renderHook((v: string) => useDraftSyncedTo(v), {
      initialProps: 'a',
    });

    act(() => result.current[1]('user-picked'));
    rerender('a');
    rerender('a');

    expect(result.current[0]).toBe('user-picked');
  });

  it('resets when the source returns to a value the draft already held', () => {
    // Guards comparing against the draft instead of the previous source: after
    // editing away from 'a' and back, a draft-based comparison would miss the reset.
    const { result, rerender } = renderHook((v: string) => useDraftSyncedTo(v), {
      initialProps: 'a',
    });

    rerender('b');
    act(() => result.current[1]('a'));
    expect(result.current[0]).toBe('a');

    rerender('a');
    expect(result.current[0]).toBe('a');
  });
});
