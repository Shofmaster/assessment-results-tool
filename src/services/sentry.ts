import * as Sentry from '@sentry/react';
import { getConfigValue } from '../config/runtimeEnv';

let enabled = false;

/**
 * Initialize Sentry error monitoring. No-ops when no DSN is configured, so local
 * dev and any deployment without one run untouched (fail-soft, matching the
 * app's other optional integrations).
 *
 * Self-hosted installs deliberately leave this unset: a customer's error reports
 * should not leave their network unless they choose it. Resolving through
 * runtimeEnv means that choice is made at install time, not build time.
 */
export function initSentry(): void {
  const dsn = getConfigValue('sentryDsn');
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

/**
 * Report a diagnostic message with structured context. Always mirrors to the
 * browser console (so it's visible on any deployment, DSN or not) and forwards
 * to Sentry when enabled. Used to trace intermittent auth-session drops that
 * only reproduce in production.
 */
export function captureMessage(
  message: string,
  extra?: Record<string, unknown>,
): void {
  // Console mirror is intentional: prod has no local logs otherwise, and this
  // is how we can read what happened when a user reports being signed out.
  console.warn(`[diag] ${message}`, extra ?? {});
  if (!enabled) return;
  Sentry.captureMessage(message, { level: 'warning', extra });
}
