import { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { DeletionStepUp } from '../types/deletionStepUp';

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  /** Called after PIN entry or after Clerk password verifies and a ticket is minted. Throw on mutation failure so the modal can show the error. */
  onComplete: (stepUp: DeletionStepUp) => void | Promise<void>;
};

export default function DeletionStepUpModal({
  open,
  title = 'Confirm deletion',
  description = 'Enter your deletion PIN or your account password to continue.',
  onClose,
  onComplete,
}: Props) {
  const createTicket = useAction(api.deletionStepUp.createPasswordStepUpTicket);
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resetFields = () => {
    setPin('');
    setPassword('');
    setError(null);
  };

  const handleClose = () => {
    if (busy) return;
    resetFields();
    setMode('pin');
    onClose();
  };

  const handlePinContinue = async () => {
    setError(null);
    const p = pin.trim();
    if (p.length < 6) {
      setError('PIN must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      await onComplete({ kind: 'pin', pin: p });
      resetFields();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordContinue = async () => {
    setError(null);
    if (!password) {
      setError('Enter your account password.');
      return;
    }
    setBusy(true);
    try {
      const ticketId = await createTicket({ password });
      await onComplete({ kind: 'passwordTicket', ticketId });
      setPassword('');
      resetFields();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60">
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-navy-900 shadow-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deletion-stepup-title"
      >
        <h2 id="deletion-stepup-title" className="text-lg font-semibold text-white mb-1">
          {title}
        </h2>
        <p className="text-sm text-white/65 mb-4">{description}</p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setMode('pin');
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
              mode === 'pin'
                ? 'border-sky/50 bg-sky/15 text-sky-light'
                : 'border-white/15 text-white/75 hover:bg-white/5'
            }`}
          >
            Deletion PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('password');
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
              mode === 'password'
                ? 'border-sky/50 bg-sky/15 text-sky-light'
                : 'border-white/15 text-white/75 hover:bg-white/5'
            }`}
          >
            Account password
          </button>
        </div>

        {mode === 'pin' ? (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-white/70">Deletion PIN</label>
            <input
              type="password"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky/35"
              placeholder="Enter PIN"
            />
            <p className="text-xs text-white/50">
              OAuth-only accounts use this PIN for sensitive actions (set in Settings).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-white/70">Clerk password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky/35"
              placeholder="Account password"
            />
            <p className="text-xs text-white/50">
              Uses your email/password sign-in with Clerk. Requires CLERK_SECRET_KEY on the backend.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-white/20 text-white/85 hover:bg-white/10 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void (mode === 'pin' ? handlePinContinue() : handlePasswordContinue())}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
          >
            {busy ? 'Verifying…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
