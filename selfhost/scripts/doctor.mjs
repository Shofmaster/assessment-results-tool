#!/usr/bin/env node
/**
 * Preflight and post-install validator for a self-hosted AeroGap deployment.
 *
 *   node scripts/doctor.mjs            full check, including network reachability
 *   node scripts/doctor.mjs --offline  configuration only, no outbound calls
 *
 * Written against the Node standard library alone and runnable before
 * `npm install`, because the first thing a customer sysadmin needs is to find
 * out what is wrong — and that must not itself require a working toolchain.
 *
 * Exit code 0 = safe to start. 1 = at least one blocking error.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const selfhostRoot = resolve(here, '..');
const OFFLINE = process.argv.includes('--offline');

const errors = [];
const warnings = [];
const notes = [];

const fail = (msg, fix) => errors.push({ msg, fix });
const warn = (msg, fix) => warnings.push({ msg, fix });
const note = (msg) => notes.push(msg);

function resolveEnvPath() {
  const explicit = (process.env.AEROGAP_ENV_FILE || '').trim();
  if (explicit && existsSync(explicit)) return explicit;

  const programData = process.env.ProgramData || process.env.PROGRAMDATA;
  if (programData) {
    const winEnv = resolve(programData, 'AeroGap', 'config', '.env');
    if (existsSync(winEnv)) return winEnv;
  }

  const installEnv = resolve(here, '.env');
  if (existsSync(installEnv)) return installEnv;

  return resolve(selfhostRoot, '.env');
}

// ---------------------------------------------------------------------------
// Load .env  (deliberately not using dotenv — see the module comment)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolveEnvPath();
  if (!existsSync(envPath)) {
    console.error(`\n  No .env file found at ${envPath}.\n`);
    console.error('    Create one from the template:  cp .env.example .env\n');
    console.error('    On Windows server installs, the file lives in C:\\ProgramData\\AeroGap\\config\\.env\n');
    process.exit(1);
  }

  const env = {};
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip matched surrounding quotes; operators add them out of habit and
    // a literal quote in a secret produces a baffling auth failure.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const get = (k) => (env[k] || '').trim();
const isSet = (k) => get(k).length > 0;
const nativeInstall =
  isSet('AEROGAP_INSTALL_DIR') ||
  get('DEPLOYMENT_MODE') === 'desktop' ||
  Boolean((process.env.AEROGAP_INSTALL_DIR || '').trim());

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Origin and TLS
// ---------------------------------------------------------------------------
const appOrigin = get('APP_ORIGIN').replace(/\/+$/, '');
if (!appOrigin) {
  fail('APP_ORIGIN is not set.', 'Set it to the URL users will open, e.g. https://aerogap.acme.internal');
} else {
  const url = parseUrl(appOrigin);
  if (!url) {
    fail(`APP_ORIGIN is not a valid URL: "${appOrigin}"`, 'Include the scheme, e.g. https://aerogap.acme.internal');
  } else {
    if (url.protocol === 'http:') {
      warn(
        'APP_ORIGIN uses http://, so browsers treat the app as an insecure context.',
        'Local-folder linking is disabled and session cookies are weakened. Use https:// unless TLS terminates upstream.',
      );
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      fail(`APP_ORIGIN must be an origin only, with no path: "${appOrigin}"`, 'Use https://host — nothing after the hostname or port.');
    }
    note(`App will be served at ${appOrigin}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Convex
// ---------------------------------------------------------------------------
const instanceSecret = get('CONVEX_INSTANCE_SECRET');
if (!instanceSecret) {
  fail('CONVEX_INSTANCE_SECRET is not set.', 'Generate once with:  openssl rand -hex 32');
} else if (!/^[0-9a-f]{64}$/i.test(instanceSecret)) {
  fail(
    'CONVEX_INSTANCE_SECRET is not 64 hex characters.',
    'The Convex backend expects a 32-byte hex value. Generate with:  openssl rand -hex 32',
  );
}

for (const key of ['CONVEX_PUBLIC_URL', 'CONVEX_SITE_URL']) {
  const value = get(key);
  if (!value) {
    fail(`${key} is not set.`, 'Both Convex hostnames must be reachable from user browsers, not just from the server.');
  } else if (!parseUrl(value)) {
    fail(`${key} is not a valid URL: "${value}"`, 'Include the scheme, e.g. https://convex.acme.internal');
  }
}

if (get('CONVEX_PUBLIC_URL') && get('CONVEX_PUBLIC_URL') === get('CONVEX_SITE_URL')) {
  fail(
    'CONVEX_PUBLIC_URL and CONVEX_SITE_URL are the same hostname.',
    'They serve different Convex ports (3210 and 3211) and need distinct hostnames.',
  );
}

if (!isSet('CONVEX_SELF_HOSTED_ADMIN_KEY')) {
  note('CONVEX_SELF_HOSTED_ADMIN_KEY is empty — expected before first boot. Run `npm run bootstrap` after the stack is up.');
}

// The instance name doubles as the Postgres database name (Convex replaces
// dashes with underscores). Keeping it underscore-only makes the two identical
// so there is no silent divergence between the created DB and the expected one.
const instanceName = get('CONVEX_INSTANCE_NAME');
if (!instanceName) {
  fail('CONVEX_INSTANCE_NAME is not set.', 'It names both the deployment and its Postgres database, e.g. aerogap_onprem');
} else if (instanceName.includes('-')) {
  fail(
    `CONVEX_INSTANCE_NAME contains a dash ("${instanceName}").`,
    `Convex derives its database name by replacing dashes with underscores, so the backend would look for "${instanceName.replace(/-/g, '_')}" while compose creates "${instanceName}". Use underscores here.`,
  );
} else if (!/^[a-z0-9_]+$/.test(instanceName)) {
  fail(
    `CONVEX_INSTANCE_NAME must be lowercase letters, digits, and underscores ("${instanceName}").`,
    'It is used verbatim as a Postgres database name.',
  );
}

// Database credentials. A mismatch here surfaces as an opaque Convex crash loop
// rather than an authentication error, so catch it before bring-up.
if (!nativeInstall) {
const pgPassword = get('POSTGRES_PASSWORD');
const dbUrl = get('CONVEX_POSTGRES_URL');
if (!pgPassword) {
  fail('POSTGRES_PASSWORD is not set.', 'Generate one with:  openssl rand -base64 24');
} else if (pgPassword === 'convex' || pgPassword === 'CHANGE_ME') {
  fail('POSTGRES_PASSWORD is still the placeholder value.', 'Set a generated password:  openssl rand -base64 24');
}

if (!dbUrl) {
  fail('CONVEX_POSTGRES_URL is not set.');
} else if (dbUrl.includes('CHANGE_ME')) {
  fail(
    'CONVEX_POSTGRES_URL still contains the CHANGE_ME placeholder.',
    'Replace it with the same value as POSTGRES_PASSWORD.',
  );
} else {
  // The backend selects its database from INSTANCE_NAME. A path segment here is
  // the single most likely first-boot mistake, and it fails opaquely.
  const withoutScheme = dbUrl.replace(/^postgresql:\/\//, '');
  const pathPart = withoutScheme.slice(withoutScheme.indexOf('@') + 1);
  if (pathPart.includes('/') && !pathPart.endsWith('/')) {
    fail(
      `CONVEX_POSTGRES_URL must not include a database name ("${dbUrl}").`,
      'It addresses the Postgres server only; the backend picks the database from CONVEX_INSTANCE_NAME. Drop the trailing /dbname.',
    );
  }

  if (pgPassword && dbUrl.includes('@postgres:')) {
    // Only meaningful for the bundled Postgres; a managed instance is the
    // operator's business.
    const embedded = dbUrl.match(/^postgresql:\/\/[^:]+:([^@]*)@/);
    if (embedded && decodeURIComponent(embedded[1]) !== pgPassword) {
      fail(
        'CONVEX_POSTGRES_URL password does not match POSTGRES_PASSWORD.',
        'The Convex backend will fail to connect. Make the two agree.',
      );
    }
  }
}
} else {
  note('Native install detected — skipping Docker Postgres checks.');
}

// The proxy serves these hostnames; they must agree with the URLs above or
// Caddy answers on a name the frontend never requests.
if (get('DEPLOYMENT_MODE') !== 'desktop') {
for (const [domainKey, urlKey] of [
  ['APP_DOMAIN', 'APP_ORIGIN'],
  ['CONVEX_DOMAIN', 'CONVEX_PUBLIC_URL'],
  ['CONVEX_SITE_DOMAIN', 'CONVEX_SITE_URL'],
]) {
  const domain = get(domainKey);
  const url = parseUrl(get(urlKey));
  if (!domain) {
    fail(`${domainKey} is not set.`, 'The reverse proxy needs the bare hostname to serve a certificate for.');
  } else if (domain.includes('://')) {
    fail(`${domainKey} must be a bare hostname, not a URL: "${domain}"`, 'Drop the https:// prefix.');
  } else if (url && url.hostname !== domain) {
    fail(
      `${domainKey} ("${domain}") does not match the hostname in ${urlKey} ("${url.hostname}").`,
      'The proxy would serve a hostname the application never advertises.',
    );
  }
}
}

// ---------------------------------------------------------------------------
// 3. Authentication
// ---------------------------------------------------------------------------
const authMode = get('AUTH_MODE') || 'clerk';
const deploymentMode = get('DEPLOYMENT_MODE') || 'server';
if (!['clerk', 'local', 'both', 'oidc'].includes(authMode)) {
  fail(`AUTH_MODE must be "clerk", "local", "both", or "oidc", got "${authMode}".`);
} else if (authMode === 'both') {
  // A desktop install offering both a local account and the hosted Clerk
  // account. Local needs the origin; Clerk needs the public trio the build
  // bakes in (never the secret key - this file ships to every customer).
  if (!isSet('APP_ORIGIN')) {
    fail('APP_ORIGIN is required when AUTH_MODE=both.', 'The local token issuer URL is derived from it.');
  }
  for (const [key, why] of [
    ['CLERK_JWT_ISSUER_DOMAIN', 'the Convex backend needs it to trust hosted-account tokens'],
    ['VITE_CLERK_PUBLISHABLE_KEY', 'the frontend cannot render the hosted sign-in without it'],
  ]) {
    if (!isSet(key)) fail(`${key} is required when AUTH_MODE=both — ${why}.`);
  }
  if (!isSet('CLERK_JWT_KEY') && !isSet('CLERK_SECRET_KEY')) {
    fail('CLERK_JWT_KEY (public verification PEM) is required when AUTH_MODE=both.', 'Without it hosted-account bearers cannot be verified by the API tier.');
  }
  note('Auth mode: both — local accounts on this machine, plus optional sign-in with a hosted AeroGap account (internet required for that path only).');
} else if (authMode === 'clerk') {
  for (const [key, why] of [
    ['CLERK_SECRET_KEY', 'without it every API request is rejected with 503'],
    ['CLERK_JWT_ISSUER_DOMAIN', 'the Convex backend needs it to trust your tokens'],
    ['VITE_CLERK_PUBLISHABLE_KEY', 'the frontend cannot render a sign-in without it'],
  ]) {
    if (!isSet(key)) fail(`${key} is required when AUTH_MODE=clerk — ${why}.`);
  }

  if (get('VITE_CLERK_PUBLISHABLE_KEY').startsWith('pk_test_')) {
    warn(
      'VITE_CLERK_PUBLISHABLE_KEY is a TEST key (pk_test_).',
      'Test instances expire sessions aggressively and show a dev banner. Use the live key (pk_live_) for a real install.',
    );
  }
  if (get('CLERK_JWT_ISSUER_DOMAIN').startsWith('http')) {
    fail(
      'CLERK_JWT_ISSUER_DOMAIN should be a bare domain, not a URL.',
      'Use clerk.yourcompany.com — no https:// prefix and no trailing slash.',
    );
  }

  note('Auth mode: clerk — sign-in traffic and your user directory leave the network. See docs/AUTH.md.');
} else if (authMode === 'local') {
  if (!isSet('APP_ORIGIN')) {
    fail(
      'APP_ORIGIN is required when AUTH_MODE=local.',
      'The token issuer URL is derived from it and must match what users open in the browser.',
    );
  }
  if (deploymentMode === 'desktop') {
    note('Auth mode: local — this desktop install issues its own identities on loopback. No Clerk configuration is required.');
  } else {
    note('Auth mode: local — this install issues its own identities. No Clerk or outbound identity dependency. See docs/AUTH.md.');
  }
} else {
  fail(
    'AUTH_MODE=oidc is not implemented yet.',
    'Use AUTH_MODE=local for an air-gapped or identity-local install, AUTH_MODE=clerk for Clerk-hosted identity, or talk to us if your own IdP is a hard requirement. See docs/AUTH.md.',
  );
}

// ---------------------------------------------------------------------------
// 4. AI providers
// ---------------------------------------------------------------------------
// This one IS fatal. AI provider keys are supplied per company in the app and
// stored in Convex; the app tier reads them over a service-token-gated route,
// so without this token NOTHING can resolve a key at any scope.
if (!isSet('AI_CREDENTIAL_SERVICE_TOKEN')) {
  fail(
    'AI_CREDENTIAL_SERVICE_TOKEN is not set.',
    'Every AI request will fail. Re-run install.ps1 (it generates one), or run bootstrap.mjs, ' +
      'which generates it and pushes the same value into the Convex backend.',
  );
}

// Provider keys are NOT required any more: an administrator adds them in the app
// under Settings > AI Keys, per company. A key here is an optional deployment-wide
// fallback, so its absence is a note, not a failure.
const embeddingProvider = get('EMBEDDING_PROVIDER') || 'voyage';
const embeddingKeyVar = embeddingProvider === 'openai' ? 'OPENAI_API_KEY' : 'VOYAGE_API_KEY';

if (!isSet('ANTHROPIC_API_KEY')) {
  note('No built-in ANTHROPIC_API_KEY - Claude features use the key added under Settings > AI Keys.');
}
if (!isSet(embeddingKeyVar)) {
  note(`No built-in ${embeddingKeyVar} - document search uses the key added under Settings > AI Keys.`);
}
if (!['voyage', 'openai'].includes(embeddingProvider)) {
  fail(`EMBEDDING_PROVIDER must be "voyage" or "openai", got "${embeddingProvider}".`);
}

// The app tier calls Convex HTTP actions on the backend's LOOPBACK port to
// resolve a company's key. Public 3211 is the TLS proxy: pointing here at it
// means trusting an internal CA from the same machine, for no benefit. This is
// the same class of mistake that once put CONVEX_URL on 3210 instead of 13210
// and made every AI request fail with a 503 approval-check error.
if (isSet('CONVEX_SITE_INTERNAL_URL') && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(get('CONVEX_SITE_INTERNAL_URL'))) {
  warn(
    `CONVEX_SITE_INTERNAL_URL is not a loopback URL: "${get('CONVEX_SITE_INTERNAL_URL')}".`,
    'It should point at the Convex backend directly (http://127.0.0.1:13211), not the TLS proxy on 3211.',
  );
}

// ---------------------------------------------------------------------------
// 5. Privacy posture — reported so the operator can confirm it, not assume it
// ---------------------------------------------------------------------------
if (isSet('VITE_SENTRY_DSN') || isSet('VITE_POSTHOG_KEY')) {
  warn(
    'Telemetry is ENABLED — this install will send error and usage data to a third party.',
    'Self-hosted installs normally leave VITE_SENTRY_DSN and VITE_POSTHOG_KEY blank. Clear them unless you intend this.',
  );
} else {
  note('Telemetry: off. No error or analytics data leaves this network.');
}

if (get('BILLING_ENFORCEMENT_ENABLED') === 'true') {
  warn('BILLING_ENFORCEMENT_ENABLED=true on a self-hosted install.', 'Self-hosted deployments are site-licensed; this normally stays false.');
}

// ---------------------------------------------------------------------------
// 6. Internal document server
// ---------------------------------------------------------------------------
const docUpstream = get('DOC_SERVER_UPSTREAM');
if (docUpstream) {
  const url = parseUrl(docUpstream);
  if (!url) {
    fail(`DOC_SERVER_UPSTREAM is not a valid URL: "${docUpstream}"`);
  } else {
    note(`Internal manuals proxied from ${docUpstream} at ${appOrigin || '{APP_ORIGIN}'}/docsrv/`);
  }
} else {
  note('DOC_SERVER_UPSTREAM not set — internal file-server manuals are disabled (this is optional).');
}

// ---------------------------------------------------------------------------
// 7. Network reachability
// ---------------------------------------------------------------------------
async function probe(label, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return { ok: true, status: res.status, label };
  } catch (err) {
    return { ok: false, label, error: err?.name === 'AbortError' ? 'timed out' : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

if (!OFFLINE) {
  const checks = [];

  if (isSet('ANTHROPIC_API_KEY')) {
    // Cheapest authenticated call that proves both egress and key validity.
    // A 400 still proves both; only a 401/403 means the key is wrong.
    checks.push(
      probe('Anthropic API', 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': get('ANTHROPIC_API_KEY'),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      }).then((r) => {
        if (!r.ok) {
          fail(`Cannot reach the Anthropic API (${r.error}).`, 'Check outbound HTTPS egress to api.anthropic.com, or set AI_HTTPS_PROXY.');
        } else if (r.status === 401 || r.status === 403) {
          fail('Anthropic rejected ANTHROPIC_API_KEY (401/403).', 'Verify the key is correct and active.');
        } else {
          note(`Anthropic API reachable and key accepted (HTTP ${r.status}).`);
        }
      }),
    );
  }

  const convexPublic = get('CONVEX_PUBLIC_URL');
  if (convexPublic) {
    checks.push(
      probe('Convex', `${convexPublic.replace(/\/+$/, '')}/version`).then((r) => {
        if (!r.ok) {
          // Expected before first bring-up; only a warning.
          warn(`Convex backend not reachable at ${convexPublic} (${r.error}).`, 'Normal before the stack is started. Re-run after `docker compose up -d`.');
        } else {
          note(`Convex backend reachable at ${convexPublic} (HTTP ${r.status}).`);
        }
      }),
    );
  }

  if (docUpstream && parseUrl(docUpstream)) {
    checks.push(
      probe('Document server', docUpstream, { method: 'HEAD' }).then((r) => {
        if (!r.ok) {
          warn(`Internal document server not reachable at ${docUpstream} (${r.error}).`, 'Check that the app host can route to it and that the hostname resolves.');
        } else {
          note(`Internal document server reachable (HTTP ${r.status}).`);
        }
      }),
    );
  }

  await Promise.all(checks);
} else {
  note('Offline mode — network reachability was not checked.');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

console.log(`\n${BOLD}AeroGap self-hosted — preflight${OFF}\n`);

for (const n of notes) console.log(`  ${DIM}·${OFF} ${n}`);

if (warnings.length) {
  console.log(`\n${YELLOW}${BOLD}  Warnings${OFF}`);
  for (const w of warnings) {
    console.log(`  ${YELLOW}!${OFF} ${w.msg}`);
    if (w.fix) console.log(`    ${DIM}${w.fix}${OFF}`);
  }
}

if (errors.length) {
  console.log(`\n${RED}${BOLD}  Errors — the stack will not start${OFF}`);
  for (const e of errors) {
    console.log(`  ${RED}✗${OFF} ${e.msg}`);
    if (e.fix) console.log(`    ${DIM}${e.fix}${OFF}`);
  }
  console.log(`\n${RED}  ${errors.length} blocking problem(s). Fix these in selfhost/.env and re-run.${OFF}\n`);
  process.exit(1);
}

console.log(`\n${GREEN}${BOLD}  Configuration is valid.${OFF}`);
console.log(`${DIM}  Next:  docker compose up -d   then   npm run bootstrap${OFF}\n`);
process.exit(0);
