import { useIdleLogout } from '../hooks/useIdleLogout';

/**
 * Renders nothing until the idle-logout warning fires, then shows a modal with a
 * countdown and a "Stay signed in" action. Mount once inside the authenticated
 * tree (AuthGate children).
 */
export default function IdleLogoutGuard() {
  const { showWarning, secondsLeft, stayActive } = useIdleLogout();

  if (!showWarning) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-logout-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-navy-900/95 p-6 text-center shadow-xl backdrop-blur">
        <h2 id="idle-logout-title" className="text-lg font-poppins font-semibold text-white">
          Still there?
        </h2>
        <p className="mt-2 text-sm text-white/70">
          You&apos;ll be signed out for inactivity in{' '}
          <span className="font-semibold text-sky-light">{secondsLeft}s</span>. Any in-progress
          traceability runs will be cancelled.
        </p>
        <button
          type="button"
          onClick={stayActive}
          className="mt-5 w-full rounded-xl bg-sky px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-light"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
