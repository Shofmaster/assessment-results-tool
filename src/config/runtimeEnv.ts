/**
 * Single source of truth for public app configuration.
 *
 * WHY THIS EXISTS
 * Vite inlines `import.meta.env.VITE_*` into the JavaScript bundle at BUILD
 * time. For the hosted product that is fine — one deployment, one build. For the
 * self-hosted product it means every customer needs their own build carrying
 * their own hostname and Clerk key, which is a bespoke build service rather than
 * a shippable installer.
 *
 * It also caused three separate production-shaped failures: a developer's
 * `.env.local` leaked a Supabase key and the production Convex URL into a
 * customer bundle; the app service refused to start because a build-time
 * publishable key was also demanded at runtime; and an installer had to grow
 * guards to stop an operator choosing a hostname the bundle could not serve.
 *
 * So values are read from a runtime-injected object first, falling back to the
 * build-time value. A hosted build behaves exactly as before (nothing injects,
 * everything falls back). A self-hosted install serves `/config.js`, which sets
 * the global before the bundle loads — so ONE build serves any hostname.
 *
 * EVERYTHING HERE IS PUBLIC. These are publishable keys, client IDs and URLs
 * that already ship inside the JavaScript bundle and are visible in any
 * browser's devtools. Secrets stay server-side and must never be added here.
 *
 * The global name `__AVIATION_APP_CONFIG__` predates this module and is kept so
 * existing deployments that already inject it keep working.
 */

/** Injected at runtime by /config.js. Every field optional — absent means "fall back". */
export interface RuntimeConfig {
  /**
   * Which identity provider this deployment uses: 'clerk' (hosted) or 'local'
   * (self-hosted, where the app server issues its own tokens). Absent means
   * 'clerk', so the hosted bundle behaves exactly as it did before this existed.
   */
  authMode?: string;
  clerkPublishableKey?: string;
  convexUrl?: string;
  convexSiteUrl?: string;
  googleClientId?: string;
  googleApiKey?: string;
  sentryDsn?: string;
  posthogKey?: string;
  posthogHost?: string;
  stripePublishableKey?: string;
  logbookOcrEndpoint?: string;
  logbookOcrApiKey?: string;
}

const GLOBAL_KEY = '__AVIATION_APP_CONFIG__';

export function readRuntimeConfig(): RuntimeConfig {
  const injected = (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY];
  // Defend against a malformed /config.js: a broken injection should degrade to
  // build-time values rather than throw during module initialisation, which
  // would blank the entire app.
  if (!injected || typeof injected !== 'object') return {};
  return injected as RuntimeConfig;
}

/**
 * Build-time values, referenced STATICALLY.
 *
 * Vite only substitutes `import.meta.env.VITE_X` when it appears literally in
 * the source. A dynamic lookup such as `import.meta.env[name]` is NOT replaced
 * and silently yields undefined in a production bundle, so every key must be
 * spelled out here even though it is repetitive.
 */
const buildTime: RuntimeConfig = {
  authMode: import.meta.env.VITE_AUTH_MODE,
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  convexUrl: import.meta.env.VITE_CONVEX_URL,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  posthogKey: import.meta.env.VITE_POSTHOG_KEY,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST,
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  logbookOcrEndpoint: import.meta.env.VITE_LOGBOOK_OCR_ENDPOINT,
  logbookOcrApiKey: import.meta.env.VITE_LOGBOOK_OCR_API_KEY,
};

/**
 * Resolve one setting: runtime injection wins, build-time value is the fallback.
 *
 * Whitespace-only and empty values are treated as absent, so an injected `""`
 * (which is what an unset variable renders as) falls through to the build-time
 * value instead of overriding it with nothing.
 */
export function getConfigValue(key: keyof RuntimeConfig): string | undefined {
  const runtime = readRuntimeConfig()[key];
  const trimmedRuntime = typeof runtime === 'string' ? runtime.trim() : '';
  if (trimmedRuntime) return trimmedRuntime;

  const fallback = buildTime[key];
  const trimmedFallback = typeof fallback === 'string' ? fallback.trim() : '';
  return trimmedFallback || undefined;
}

/** True when a runtime configuration was injected — used for diagnostics only. */
export function hasRuntimeConfig(): boolean {
  return Object.keys(readRuntimeConfig()).length > 0;
}
