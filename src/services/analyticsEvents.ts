import { trackEvent } from './analytics';

/**
 * Named product events for the money/retention moments worth measuring.
 * Keep this list small and intentional — autocapture covers generic clicks.
 */
export const ANALYTICS_EVENTS = {
  ANALYSIS_RUN: 'analysis_run',
  AUDIT_SIMULATION_STARTED: 'audit_simulation_started',
  REPORT_EXPORTED: 'report_exported',
  MANUAL_GENERATED: 'manual_generated',
  PROJECT_CREATED: 'project_created',
  CHECKOUT_STARTED: 'checkout_started',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Thin wrapper so call-sites don't import PostHog directly. Fails soft when
 * analytics is disabled.
 */
export function track(
  event: AnalyticsEvent,
  props?: Record<string, unknown>,
): void {
  trackEvent(event, props);
}
