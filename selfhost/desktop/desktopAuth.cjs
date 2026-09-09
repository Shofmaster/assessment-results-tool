/**
 * Which identity providers a desktop install offers.
 *
 * ONE DECISION, TWO CONSUMERS
 * The supervisor hands AUTH_MODE to the application server, and first-run
 * setup pushes the same AUTH_MODE (plus the Clerk issuer) into the Convex
 * deployment. If those two ever disagreed, the server would mint or accept
 * tokens that Convex rejects, and every sign-in would fail with nothing useful
 * in the logs. So both read the answer from here.
 *
 * THE RULE
 *   - Local accounts are ALWAYS available. They work with no internet and keep
 *     identity on the machine, which is the desktop product's baseline promise.
 *   - The hosted-account option ('both') is offered when the build carries the
 *     three public Clerk values (issuer domain, publishable key, JWT
 *     verification key). Without them there is nothing to sign in against.
 *   - A line `AUTH_MODE=local` in config\.env turns the hosted option OFF even
 *     when the build has Clerk values. A privacy-minded customer can make that
 *     choice once and it survives upgrades, because the file is theirs.
 *
 * NOTHING ELSE. No AUTH_MODE=clerk on desktop: that would remove local
 * accounts and make an offline machine unable to sign in at all.
 */
const fs = require('node:fs');
const path = require('node:path');

/** Parse KEY=value lines. Same subset as firstRun.cjs / envFile.ts. */
function parseEnv(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key) out[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * @param {object} options
 * @param {string} options.installDir  holds build-config.json
 * @param {string} options.configDir   holds the user's .env
 * @returns {{
 *   authMode: 'local'|'both',
 *   clerkIssuerDomain: string,
 *   clerkPublishableKey: string,
 *   clerkJwtKey: string,
 *   reason: string,
 * }}
 */
function resolveDesktopAuth({ installDir, configDir }) {
  const build = readJson(path.join(installDir, 'build-config.json'));
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  const clerkIssuerDomain = str(build.CLERK_JWT_ISSUER_DOMAIN);
  const clerkPublishableKey = str(build.VITE_CLERK_PUBLISHABLE_KEY);
  const clerkJwtKey = str(build.CLERK_JWT_KEY);
  const clerkComplete = Boolean(clerkIssuerDomain && clerkPublishableKey && clerkJwtKey);

  let fileMode = '';
  try {
    fileMode = str(parseEnv(fs.readFileSync(path.join(configDir, '.env'), 'utf8')).AUTH_MODE);
  } catch {
    // No .env yet - first launch.
  }

  if (fileMode === 'local') {
    return {
      authMode: 'local',
      clerkIssuerDomain,
      clerkPublishableKey,
      clerkJwtKey,
      reason: 'AUTH_MODE=local in config\\.env disables hosted-account sign-in',
    };
  }
  if (!clerkComplete) {
    return {
      authMode: 'local',
      clerkIssuerDomain,
      clerkPublishableKey,
      clerkJwtKey,
      reason: 'build carries no Clerk configuration',
    };
  }
  return {
    authMode: 'both',
    clerkIssuerDomain,
    clerkPublishableKey,
    clerkJwtKey,
    reason: 'build carries Clerk configuration',
  };
}

/**
 * Rewrite one Set-Cookie header value so the cookie is stored and sent across
 * sites: `SameSite=None; Secure`.
 *
 * Used by the desktop shell on responses from the hosted identity provider,
 * whose session cookie is `SameSite=Lax` - fine when app and provider share a
 * site, fatal when the app is http://127.0.0.1 (see allowHostedSignInCookies
 * in main.cjs). Nothing else about the cookie changes: it is still scoped to
 * the provider's host, so the only party that can read it is the one that set
 * it. Pure; exported for tests.
 */
function relaxSameSite(setCookie) {
  let out = String(setCookie);
  if (/;\s*SameSite=(Lax|Strict)/i.test(out)) {
    out = out.replace(/;\s*SameSite=(Lax|Strict)/gi, '; SameSite=None');
  } else if (!/;\s*SameSite=/i.test(out)) {
    out += '; SameSite=None';
  }
  if (!/;\s*Secure\b/i.test(out)) out += '; Secure';
  return out;
}

/**
 * Hosts of the social sign-in providers Clerk may send the window to.
 *
 * Clerk's "Continue with <provider>" navigates the page DIRECTLY to the
 * provider's authorization page, not via Clerk's own host, so the shell has to
 * recognise these to keep the sign-in inside the window. Only https, and only
 * these hosts (or their subdomains): an ordinary link in the app must still go
 * to the system browser. Google is the one enabled today; the others are the
 * hosts Clerk uses for the providers most likely to be switched on next, so
 * enabling one in the Clerk dashboard does not also need a desktop release.
 */
const OAUTH_PROVIDER_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'github.com',
];

/** @param {URL} target */
function isOAuthProviderHost(target) {
  if (target.protocol !== 'https:') return false;
  const host = target.hostname.toLowerCase();
  return OAUTH_PROVIDER_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Make Google show its account chooser.
 *
 * The desktop window has a browser profile of its own, and usually exactly one
 * Google account has ever signed in there. Absent instructions, Google skips
 * the chooser and signs that account straight in - so a user with several
 * accounts cannot pick, and signing out of AeroGap and back in lands on the
 * same account every time. `prompt=select_account` is Google's documented way
 * to ask for the chooser regardless; it is added only when Clerk did not send
 * a prompt of its own. Returns null when the URL is not a Google authorization
 * request or needs no change.
 *
 * @param {URL} target
 * @returns {string|null}
 */
function withAccountChooser(target) {
  if (target.protocol !== 'https:') return null;
  if (target.hostname.toLowerCase() !== 'accounts.google.com') return null;
  if (!/^\/o\/oauth2\/(v2\/)?auth$/.test(target.pathname)) return null;
  if (target.searchParams.has('prompt')) return null;
  const url = new URL(target.href);
  url.searchParams.set('prompt', 'select_account');
  return url.href;
}

module.exports = {
  resolveDesktopAuth,
  parseEnv,
  relaxSameSite,
  isOAuthProviderHost,
  withAccountChooser,
  OAUTH_PROVIDER_HOSTS,
};
