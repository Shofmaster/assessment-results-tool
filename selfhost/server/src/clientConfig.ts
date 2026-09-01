/**
 * Serves /config.js — the public app configuration, injected at runtime.
 *
 * WHY
 * Vite inlines VITE_* values into the bundle at build time, so without this
 * every customer needs their own build carrying their own hostname and keys.
 * The SPA reads `window.__AVIATION_APP_CONFIG__` first (see
 * src/config/runtimeEnv.ts) and falls back to the build-time value, so serving
 * this file lets ONE prebuilt installer work for any hostname.
 *
 * EVERYTHING EMITTED HERE IS PUBLIC by definition: publishable keys, OAuth
 * client IDs and URLs that already ship inside the JavaScript bundle and are
 * visible in any browser's devtools. Server-side secrets — ANTHROPIC_API_KEY,
 * CLERK_SECRET_KEY, the instance secret — must never be added to this map. The
 * allowlist below is exhaustive on purpose: it is far easier to review than a
 * filter that tries to exclude the dangerous names.
 */
import type { Express, Request, Response } from 'express';

/**
 * env var -> the key the SPA reads. Adding an entry publishes that value to
 * every browser that loads the app, so anything added here must be public.
 */
const PUBLIC_CONFIG_MAP: ReadonlyArray<readonly [envVar: string, clientKey: string]> = [
  // Which sign-in the SPA should render. Public by definition - the login
  // screen announces it either way.
  ['AUTH_MODE', 'authMode'],
  ['VITE_CLERK_PUBLISHABLE_KEY', 'clerkPublishableKey'],
  ['CONVEX_PUBLIC_URL', 'convexUrl'],
  ['CONVEX_SITE_URL', 'convexSiteUrl'],
  ['VITE_GOOGLE_CLIENT_ID', 'googleClientId'],
  ['VITE_GOOGLE_API_KEY', 'googleApiKey'],
  ['VITE_SENTRY_DSN', 'sentryDsn'],
  ['VITE_POSTHOG_KEY', 'posthogKey'],
  ['VITE_POSTHOG_HOST', 'posthogHost'],
  ['VITE_STRIPE_PUBLISHABLE_KEY', 'stripePublishableKey'],
  ['VITE_LOGBOOK_OCR_ENDPOINT', 'logbookOcrEndpoint'],
  ['VITE_LOGBOOK_OCR_API_KEY', 'logbookOcrApiKey'],
];

/** Names that must never be published, checked as a backstop against the map. */
const FORBIDDEN = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'VOYAGE_API_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'CONVEX_INSTANCE_SECRET',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  // Grants the bearer the ability to read any customer's stored provider keys
  // out of Convex. Publishing it would defeat the whole BYOK security model.
  'AI_CREDENTIAL_SERVICE_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'POSTGRES_PASSWORD',
  'SMTP_PASSWORD',
  'GOOGLE_CLIENT_SECRET',
  'OIDC_CLIENT_SECRET',
];

export function buildClientConfig(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const config: Record<string, string> = {};

  for (const [envVar, clientKey] of PUBLIC_CONFIG_MAP) {
    // A refactor that accidentally lists a secret should fail loudly at startup,
    // not quietly publish it to every browser.
    if (FORBIDDEN.includes(envVar)) {
      throw new Error(`Refusing to publish ${envVar} to the browser — it is a server-side secret.`);
    }
    const value = (env[envVar] || '').trim();
    if (value) config[clientKey] = value;
  }

  return config;
}

/**
 * Render the config as a script. JSON.stringify is escaped for `<` so a value
 * containing "</script>" cannot break out of the tag — the values come from an
 * operator's config file, which is trusted but not necessarily careful.
 */
export function renderConfigScript(config: Record<string, string>): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return [
    '// Generated at runtime by the AeroGap server. Do not edit.',
    '// Public configuration only; secrets stay server-side.',
    `window.__AVIATION_APP_CONFIG__ = ${json};`,
    '',
  ].join('\n');
}

export function mountClientConfig(app: Express): void {
  // Built once at startup: the values come from the process environment, which
  // does not change without a restart, and rebuilding per request would only
  // add a chance of drift between requests.
  const config = buildClientConfig();
  const body = renderConfigScript(config);

  app.get('/config.js', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    // Never cached. index.html is also no-cache, and a stale config.js pointing
    // at a previous hostname would produce an app that loads and cannot connect
    // — the exact failure this whole mechanism exists to prevent.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.send(body);
  });

  console.log(`[aerogap] client config    ${Object.keys(config).length} public values at /config.js`);
}
