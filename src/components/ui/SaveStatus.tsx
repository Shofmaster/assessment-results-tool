import { useCallback, useEffect, useRef, useState } from 'react';
import { FiAlertCircle, FiCheck } from 'react-icons/fi';
import { Spinner } from './Spinner';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatusProps {
  state: SaveState;
  /** Shown in the idle state — e.g. "Changes save automatically". */
  idleLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
  /** Error detail; falls back to a generic message. */
  errorLabel?: string;
  className?: string;
}

/**
 * One inline indicator for auto-saving settings, replacing the mix of transient
 * green "Saved!" flags, silent saves, and bespoke inline text across the app.
 */
export function SaveStatus({
  state,
  idleLabel,
  savingLabel = 'Saving…',
  savedLabel = 'Saved',
  errorLabel = 'Save failed — try again',
  className = '',
}: SaveStatusProps) {
  if (state === 'idle' && !idleLabel) return null;

  return (
    // A span, not a p: Spinner renders a <div>, which is invalid inside <p>.
    <span
      aria-live="polite"
      className={[
        'inline-flex items-center gap-2 text-sm',
        state === 'saved'
          ? 'text-green-400'
          : state === 'error'
            ? 'text-rose-300'
            : state === 'saving'
              ? 'text-sky-200/90'
              : 'text-white/50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {state === 'saving' && <Spinner size="sm" />}
      {state === 'saved' && <FiCheck aria-hidden />}
      {state === 'error' && <FiAlertCircle aria-hidden />}
      {state === 'saving'
        ? savingLabel
        : state === 'saved'
          ? savedLabel
          : state === 'error'
            ? errorLabel
            : idleLabel}
    </span>
  );
}

export interface UseSaveStatusResult {
  state: SaveState;
  error: string | null;
  /** Wraps an async save: flips to saving, then saved (auto-clearing) or error. */
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  reset: () => void;
}

/**
 * Drives SaveStatus. Clears the "saved" state after `resetAfterMs` and cancels
 * pending timers on unmount so a save that lands after navigation cannot set
 * state on an unmounted component.
 */
export function useSaveStatus(resetAfterMs = 2000): UseSaveStatusResult {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('idle');
    setError(null);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState('saving');
      setError(null);
      try {
        await fn();
        if (!mountedRef.current) return true;
        setState('saved');
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) setState('idle');
        }, resetAfterMs);
        return true;
      } catch (err) {
        if (!mountedRef.current) return false;
        setState('error');
        setError(err instanceof Error ? err.message : 'Save failed');
        return false;
      }
    },
    [resetAfterMs],
  );

  return { state, error, run, reset };
}
