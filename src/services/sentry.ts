import * as Sentry from '@sentry/react';

let enabled = false;

/**
 * Initialize Sentry error monitoring. No-ops when VITE_SENTRY_DSN is unset so
 * local dev and any deployment without a DSN run untouched (fail-soft, matching
 * the app's other optional integrations).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
  enabled = true;
}

/** Attach (or clear) the signed-in user so error reports are attributable. */
export function setSentryUser(
  user: { id: string; email?: string } | null,
): void {
  if (!enabled) return;
  Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}

/** Manually report an exception (used by the app's ErrorBoundary). */
export function captureException(error: unknown, componentStack?: string): void {
  if (!enabled) return;
  Sentry.captureException(
    error,
    componentStack ? { contexts: { react: { componentStack } } } : undefined,
  );
}
