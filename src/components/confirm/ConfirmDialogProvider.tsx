/**
 * App-wide replacement for window.confirm / window.prompt destructive dialogs.
 *
 * A single GlassModal is mounted by the provider; call sites use the
 * promise-based hook so a native `if (!confirm(msg)) return;` becomes
 * `if (!(await confirmDialog({ message: msg }))) return;` — no per-site modal
 * state or JSX needed.
 *
 * `requireText` turns the dialog into a type-the-name-to-confirm gate: the
 * confirm button stays disabled until the typed value trim-matches exactly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, GlassModal } from '../ui';

export type ConfirmDialogOptions = {
  /** Dialog title. Defaults to 'Are you sure?'. */
  title?: string;
  message: ReactNode;
  /** Confirm button label. Defaults to 'Confirm'. */
  confirmLabel?: string;
  /** Cancel button label. Defaults to 'Cancel'. */
  cancelLabel?: string;
  /** Red confirm button. Defaults to true — most callers guard deletes. */
  destructive?: boolean;
  /** Exact text the user must type before the confirm button enables. */
  requireText?: string;
};

type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function useConfirmDialog(): ConfirmFn {
  const confirm = useContext(ConfirmDialogContext);
  if (!confirm) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  }
  return confirm;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // If a dialog is somehow already open, treat the older one as cancelled.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setTyped('');
      setOptions(opts);
    });
  }, []);

  const settle = (result: boolean) => {
    setOptions(null);
    setTyped('');
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  const typedMatches =
    !options?.requireText || typed.trim() === options.requireText.trim();

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <GlassModal
        open={options !== null}
        title={options?.title ?? 'Are you sure?'}
        onClose={() => settle(false)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={options?.destructive === false ? 'primary' : 'destructive'}
              size="sm"
              disabled={!typedMatches}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>{options?.message}</div>
          {options?.requireText ? (
            <div>
              <label className="block text-xs text-white/60 mb-1">
                Type <span className="font-semibold text-white/85">{options.requireText}</span> to
                confirm:
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-sky-light transition-colors text-white text-sm"
              />
            </div>
          ) : null}
        </div>
      </GlassModal>
    </ConfirmDialogContext.Provider>
  );
}
