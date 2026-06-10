import posthog from 'posthog-js';

let enabled = false;

/**
 * Initialize PostHog product analytics. No-ops when VITE_POSTHOG_KEY is unset so
 * local dev and key-less deployments run untouched (fail-soft).
 *
 * Session replay is sampled client-side (~20% of sessions) to control cost;
 * autocapture + custom events still fire for everyone.
 */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  const host =
    import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
  if (!key) return;

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    autocapture: true,
    // Record roughly one in five sessions to keep replay volume (and cost) down.
    disable_session_recording: Math.random() >= 0.2,
  });
  enabled = true;
}

/** Associate subsequent events with the signed-in user. */
export function identifyUser(user: {
  id: string;
  email?: string;
  companyId?: string;
}): void {
  if (!enabled) return;
  posthog.identify(user.id, {
    email: user.email,
    companyId: user.companyId,
  });
}

/** Clear identity on sign-out so events aren't cross-attributed. */
export function resetAnalytics(): void {
  if (!enabled) return;
  posthog.reset();
}

/** Capture a product event. Safe to call even when analytics is disabled. */
export function trackEvent(
  event: string,
  props?: Record<string, unknown>,
): void {
  if (!enabled) return;
  posthog.capture(event, props);
}
