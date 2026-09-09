/**
 * AeroGap self-hosted application server.
 *
 * In the hosted product each file under `api/` is a separate Vercel serverless
 * function. On-prem there is no Vercel, so this process mounts those same
 * handlers on an Express router and serves the built SPA alongside them.
 *
 * The handlers are deliberately NOT forked. They are imported as-is from
 * `api/`, so hosted and on-prem run identical request logic and a fix to one is
 * a fix to both. Everything Vercel provided implicitly (JSON body parsing,
 * `req.query`, `res.status().send()`) is supplied here instead.
 */
import express, { type Express, type Request, type Response } from 'express';
import { createServer } from 'node:http';

import claudeHandler from '../../../api/claude.js';
import chatHandler from '../../../api/chat.js';
import claudeModelsHandler from '../../../api/claude-models.js';
import embedHandler from '../../../api/embed.js';
import rerankHandler from '../../../api/rerank.js';
import ecfrHandler from '../../../api/ecfr.js';
import faaNnumberHandler from '../../../api/faa-nnumber.js';
import dueIcalHandler from '../../../api/due-ical.js';

import { mountDocServerProxy } from './docServerProxy.js';
import { mountClientConfig } from './clientConfig.js';
import { requireConfig, describeConfig, acceptsLocalTokens } from './config.js';
import { configureEgressProxy, redactProxyUrl } from './egressProxy.js';
import { loadEnvFile } from './envFile.js';
import { applyBuildConfig, describeBuildConfig } from './buildConfig.js';
import {
  buildCheckInPayload,
  describeEntitlements,
  entitlementEndpoint,
  evaluateCache,
  readCache,
  resolveEntitlements,
  persistLicenseKey,
  CHECK_IN_INTERVAL_MS,
  type Entitlements,
} from './entitlements.js';
import { verifyRequestAuth } from '../../../api/_lib/auth.js';
import {
  buildJwks,
  issuerFor,
  jwksUrlFor,
  loadOrCreateKeyPair,
  type LocalKeyPair,
} from './localAuth.js';
import { mountLocalAuthRoutes } from './localAuthRoutes.js';
import { createHostedIdentity } from './hostedIdentity.js';

type VercelStyleHandler = (req: Request, res: Response) => unknown | Promise<unknown>;

/**
 * Entitlements for this install, held in memory and refreshed on a timer.
 *
 * Never fetched inside a request: a licensing server having a bad day must not
 * be able to slow down, let alone fail, a page load on a customer's machine.
 */
let entitlementState: Entitlements | null = null;

/**
 * The local signing key, loaded once at boot.
 *
 * Held in module scope rather than re-read per request: reading a PEM and
 * parsing an RSA key on every token mint would make sign-in noticeably slow,
 * and the key never changes while the process is alive.
 */
let localKeyPair: LocalKeyPair | null = null;

/** True when this install issues its own identities (alone, or beside Clerk). */
function usingLocalAuth(): boolean {
  return acceptsLocalTokens(process.env.AUTH_MODE);
}

function dataRoot(): string {
  return process.env.AEROGAP_DATA_ROOT || process.cwd();
}

/**
 * Ensure LOCAL_AUTH_ISSUER and LOCAL_AUTH_JWKS_URL match APP_ORIGIN.
 *
 * api/_lib/auth.ts reads these from process.env when verifying bearer tokens.
 * The app server derives them from APP_ORIGIN so they cannot drift from the
 * issuer stamped into tokens at sign-in.
 */
function applyLocalAuthEnv(): void {
  if (!acceptsLocalTokens(process.env.AUTH_MODE)) return;
  const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '');
  if (!origin) return;
  if (!process.env.LOCAL_AUTH_ISSUER?.trim() || process.env.LOCAL_AUTH_ISSUER === 'unused') {
    process.env.LOCAL_AUTH_ISSUER = issuerFor(origin);
  }
  if (!process.env.LOCAL_AUTH_JWKS_URL?.trim() || process.env.LOCAL_AUTH_JWKS_URL === 'unused') {
    process.env.LOCAL_AUTH_JWKS_URL = jwksUrlFor(origin);
  }
}

/** Last known entitlements, aged against the clock on every read. */
function currentEntitlements(): Entitlements {
  // Re-evaluated rather than returned as-is so that an install which has been
  // offline for weeks transitions through grace and into degraded WITHOUT
  // needing a successful check-in to notice.
  if (entitlementState) return entitlementState;
  return evaluateCache(readCache(dataRoot()), Date.now());
}

/**
 * Check in, then keep checking in.
 *
 * Deliberately fire-and-forget: startup does not await it. An install must
 * finish booting and serve the app whether or not we are reachable.
 */
function startEntitlementRefresh(appVersion: string, deploymentMode: string): void {
  const endpoint = entitlementEndpoint();

  const refresh = async () => {
    const payload = buildCheckInPayload({
      installId: process.env.AEROGAP_INSTALL_ID || 'unknown',
      licenseKey: process.env.AEROGAP_LICENSE_KEY || null,
      appVersion,
      deploymentMode,
    });
    entitlementState = await resolveEntitlements({ endpoint, dataRoot: dataRoot(), payload });
  };

  void refresh();

  // unref() so a pending timer cannot hold the process open during shutdown -
  // in desktop mode the supervisor kills this child on quit and a live handle
  // would delay that behind a visible pause.
  const timer = setInterval(() => void refresh(), CHECK_IN_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * `api/` handlers are written against Vercel's Node signature. Express is
 * request-compatible, but an unhandled rejection in a handler would otherwise
 * hang the socket until the client times out, so failures are converted into a
 * 500 here. The detail is logged, never returned — handler errors can carry
 * upstream API responses and key material.
 */
function adapt(name: string, handler: VercelStyleHandler) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[api/${name}] unhandled error:`, err);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      } else {
        // Streaming response already committed; close it rather than leaving
        // the client waiting on a body that will never arrive.
        res.end();
      }
    }
  };
}

export function buildApp(): Express {
  const app = express();

  // Behind the stack's reverse proxy. Required for req.protocol/secure and for
  // the rate limiter to key on the real client IP rather than the proxy's.
  app.set('trust proxy', 1);
  // Do not advertise the server stack to clients.
  app.disable('x-powered-by');

  // 10 MB ceiling: slightly above the 9 MB MAX_BODY_BYTES the handlers enforce
  // in checkBodySize(), so an oversized request gets the app's own 413 with a
  // useful message instead of Express's generic parser error.
  app.use(express.json({ limit: '10mb' }));

  // Liveness/readiness. Intentionally unauthenticated and free of any config
  // detail — container orchestrators and load balancers poll this.
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'aerogap-selfhost' });
  });

  const api = express.Router();
  api.all('/claude', adapt('claude', claudeHandler as VercelStyleHandler));
  api.all('/chat', adapt('chat', chatHandler as VercelStyleHandler));
  api.all('/claude-models', adapt('claude-models', claudeModelsHandler as VercelStyleHandler));
  api.all('/embed', adapt('embed', embedHandler as VercelStyleHandler));
  api.all('/rerank', adapt('rerank', rerankHandler as VercelStyleHandler));
  api.all('/ecfr', adapt('ecfr', ecfrHandler as VercelStyleHandler));
  api.all('/faa-nnumber', adapt('faa-nnumber', faaNnumberHandler as VercelStyleHandler));
  api.all('/due-ical', adapt('due-ical', dueIcalHandler as VercelStyleHandler));

  // What this install is licensed to do. Served from the in-process cache, not
  // fetched per request: the licensing server must never sit in the hot path of
  // a page load, and a request that arrives during an outage still gets the last
  // known-good answer rather than an error.
  //
  // Unauthenticated on purpose. It reveals which features are switched on for a
  // machine the caller can already reach on loopback, and gating it would make
  // the sign-in page unable to explain why a feature is unavailable.
  api.get('/entitlements', (_req, res) => {
    res.status(200).json(currentEntitlements());
  });

  /**
   * Activate a license key.
   *
   * WHO MAY CALL THIS
   * In DESKTOP mode the server is bound to 127.0.0.1, so reaching this endpoint
   * already means being the logged-in user on the machine - the same person who
   * installed the product. That is the boundary, and an extra auth check would
   * only mean a customer cannot activate before signing in.
   *
   * In SERVER mode the app is reachable across the LAN, so an unauthenticated
   * activation endpoint would let anyone on the network change the company's
   * license. There it requires a verified, approved account.
   */
  api.post('/activate', async (req, res) => {
    if (process.env.DEPLOYMENT_MODE !== 'desktop') {
      const auth = await verifyRequestAuth(req);
      if (!auth.ok) {
        res.status(auth.status || 401).json({ error: auth.message || 'Not authorized.' });
        return;
      }
    }

    const licenseKey = typeof req.body?.licenseKey === 'string' ? req.body.licenseKey.trim() : '';
    if (!licenseKey) {
      res.status(400).json({ error: 'A license key is required.' });
      return;
    }
    // Shape is validated in the browser, where the message can be helpful. This
    // is only a sanity bound so a pasted document cannot be written to .env.
    if (licenseKey.length > 64) {
      res.status(400).json({ error: 'That does not look like a license key.' });
      return;
    }

    try {
      persistLicenseKey(dataRoot(), licenseKey);
    } catch (err) {
      console.error('[aerogap] could not persist license key:', err);
      res.status(500).json({ error: 'The license key could not be saved on this machine.' });
      return;
    }

    // Check in immediately rather than waiting for the next timer tick: the
    // customer is watching this button and expects an answer now.
    const endpoint = entitlementEndpoint();
    entitlementState = await resolveEntitlements({
      endpoint,
      dataRoot: dataRoot(),
      payload: buildCheckInPayload({
        installId: process.env.AEROGAP_INSTALL_ID || 'unknown',
        licenseKey,
        appVersion: process.env.npm_package_version || '0.0.0',
        deploymentMode: process.env.DEPLOYMENT_MODE || 'server',
      }),
    });

    res.status(200).json(entitlementState);
  });

  app.use('/api', api);

  /**
   * The local identity provider's public surface.
   *
   * Mounted OUTSIDE /api on purpose. Convex fetches the JWKS itself, as a
   * server-to-server call with no session, and /api is where request-authenticated
   * routes live - putting an unauthenticated well-known endpoint there invites
   * someone to later add a blanket auth guard and silently break token
   * validation for the whole install.
   *
   * Both routes are public by definition: a JWKS contains only public keys, and
   * OIDC discovery is a published document by design.
   */
  if (usingLocalAuth()) {
    const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '');
    const issuer = issuerFor(origin);

    app.get('/local-auth/.well-known/jwks.json', (_req, res) => {
      if (!localKeyPair) {
        res.status(503).json({ error: 'Local authentication is not initialised.' });
        return;
      }
      // Cacheable, but briefly: a rotated key has to become visible without an
      // operator restarting the Convex backend to clear its cache.
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).json(buildJwks(localKeyPair));
    });

    // Sign-in, sign-up, session and token exchange. Mounted here rather than
    // under /api for the same reason as the well-known routes: /api is where
    // request-authenticated handlers live, and these are how a request becomes
    // authenticated in the first place.
    // A hosted-account session can be turned into a local one only when this
    // install also trusts Clerk (AUTH_MODE=both) AND carries the public key to
    // verify its tokens without a network. Absent either, the route is not
    // mounted at all rather than mounted and failing.
    const clerkJwtKey = (process.env.CLERK_JWT_KEY || '').trim();
    const hostedIdentity =
      (process.env.AUTH_MODE || '').trim() === 'both' && clerkJwtKey
        ? createHostedIdentity({
            jwtKey: clerkJwtKey,
            audience: process.env.CLERK_JWT_AUDIENCE,
            convexUrl: process.env.CONVEX_URL || process.env.CONVEX_PUBLIC_URL || '',
          })
        : null;

    mountLocalAuthRoutes(app, {
      getKeyPair: () => localKeyPair,
      appOrigin: origin,
      convexSiteUrl:
        process.env.CONVEX_SITE_INTERNAL_URL || process.env.CONVEX_SITE_URL || '',
      serviceToken: (process.env.AI_CREDENTIAL_SERVICE_TOKEN || '').trim(),
      hostedIdentity,
    });

    app.get('/local-auth/.well-known/openid-configuration', (_req, res) => {
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).json({
        issuer,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ['RS256'],
        // Deliberately minimal. This is not a general-purpose OIDC provider and
        // advertising endpoints that do not exist would invite clients to call
        // them.
        response_types_supported: ['id_token'],
        subject_types_supported: ['public'],
      });
    });
  }

  // Must be mounted before the static handler: the SPA loads /config.js from a
  // <script> tag in index.html, and it is generated per install rather than
  // being a file on disk.
  mountClientConfig(app);

  // Reverse-proxies an internal manual server under this origin. This is the
  // capability the hosted product cannot offer: same-origin means no CORS
  // preflight and no mixed-content block on a plain-HTTP internal file server.
  mountDocServerProxy(app);

  // Built SPA. Hashed assets are immutable and cached hard; index.html must not
  // be, or clients pin to a stale bundle across upgrades.
  const distDir = process.env.DIST_DIR || '/app/dist';
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        // Normalize separators: this runs on Windows during local development
        // and on Linux in the container, and a backslash path would silently
        // skip the assets branch and serve hashed bundles as max-age=0.
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // Client-side routing fallback. Anything not matched above is a react-router
  // path, except /api/* which must 404 as JSON rather than silently returning
  // the HTML shell — an HTML body to a fetch() call produces a confusing
  // "Unexpected token <" instead of a real error.
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // This path serves index.html for every SPA route including "/", so it —
    // not the static middleware above — is what actually governs shell caching.
    // Without this the shell is served with express.static's default max-age=0,
    // which browsers may still heuristically cache, pinning users to the old
    // bundle after an upgrade.
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile('index.html', { root: distDir });
  });

  return app;
}

function main(): void {
  // Fail closed at boot. A misconfigured install must not start and serve
  // requests that silently bypass auth or spend against an absent key.
  //
  // The operator here is a customer sysadmin reading `docker compose logs`, not
  // one of us. A Node stack trace buries the actionable part, so config
  // failures print as a plain checklist and exit non-zero for the orchestrator.
  // Must precede requireConfig(): when running as a Windows Service the
  // configuration lives in a file rather than the process environment.
  // Baked build-time defaults, applied FIRST so that both the environment and
  // the env file can override them. This is what lets the installer stop asking
  // for Clerk configuration: those values identify our tenant, are the same at
  // every site, and none of them is a secret.
  const buildConfig = applyBuildConfig();

  let envFile;
  try {
    envFile = loadEnvFile();
  } catch (err) {
    console.error(`\n  AeroGap cannot start - ${(err as Error).message}\n`);
    process.exit(1);
  }

  applyLocalAuthEnv();

  let config;
  try {
    config = requireConfig();
  } catch (err) {
    const problems = (err as { problems?: string[] }).problems;
    if (!problems) throw err;
    console.error('\n  AeroGap cannot start - configuration is incomplete.\n');
    for (const problem of problems) console.error(`    [X] ${problem}`);
    console.error('\n  Fix these in your .env file, then run: npm run doctor\n');
    process.exit(1);
  }

  // Must run before any outbound request is made, and before the listener
  // starts — a malformed proxy URL should stop the boot, not silently leave
  // vendor traffic bypassing the operator's inspection proxy.
  let egress;
  try {
    egress = configureEgressProxy();
  } catch (err) {
    console.error(`\n  AeroGap cannot start - ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Load the signing key before anything can ask for the JWKS. Failing here is
  // fatal on purpose: an install in local-auth mode that cannot sign tokens
  // cannot authenticate anyone, and starting anyway would present as a login
  // page that silently never works.
  if (usingLocalAuth()) {
    try {
      localKeyPair = loadOrCreateKeyPair(dataRoot());
      console.log(`[aerogap] local auth      issuer ${issuerFor((process.env.APP_ORIGIN || '').replace(/\/+$/, ''))}`);
    } catch (err) {
      console.error(`
  AeroGap cannot start - could not load the local signing key: ${(err as Error).message}
`);
      process.exit(1);
    }
  }

  // Started before the listener so the first request already has an answer,
  // but NOT awaited: an unreachable licensing server must not delay a launch.
  startEntitlementRefresh(process.env.npm_package_version || '0.0.0', config.deploymentMode);

  const app = buildApp();
  const port = Number(process.env.APP_PORT || 8080);

  // Which interface to listen on. Defaults to all, which is what the container
  // needs — Docker publishes the port and the app must accept the bridge
  // network. A Windows install sets 127.0.0.1 so the only route in is the
  // reverse proxy that terminates TLS; binding all interfaces there would let a
  // client bypass the proxy and reach the app over plain http.
  const bindHost = (process.env.APP_BIND || '').trim();
  const server = createServer(app);

  // Long-running AI requests: api/claude.ts is allowed up to 300s in the hosted
  // product (vercel.json maxDuration). Node's 2-minute default would sever a
  // streaming analysis mid-flight, so headers/request timeouts are raised past
  // that ceiling.
  server.headersTimeout = 310_000;
  server.requestTimeout = 310_000;

  const onListening = () => {
    console.log(`[aerogap] listening on ${bindHost || '*'}:${port}`);
    if (envFile.loaded) {
      console.log(`[aerogap] config file     ${envFile.path} (${envFile.applied} values)`);
    }
    const buildLine = describeBuildConfig(buildConfig);
    if (buildLine) console.log(`[aerogap] ${buildLine}`);
    console.log(`[aerogap] ${describeEntitlements(currentEntitlements())}`);
    for (const line of describeConfig(config)) console.log(`[aerogap] ${line}`);
    console.log(
      `[aerogap] egress proxy    ${
        egress.enabled
          ? `${redactProxyUrl(egress.proxyUrl!)}${egress.noProxy ? ` (bypass: ${egress.noProxy})` : ''}`
          : 'direct (no proxy configured)'
      }`,
    );
  };

  // An empty host means "all interfaces" — passing '' explicitly would be
  // treated as a hostname, so the argument is omitted entirely in that case.
  if (bindHost) {
    server.listen(port, bindHost, onListening);
  } else {
    server.listen(port, onListening);
  }

  const shutdown = (signal: string) => () => {
    console.log(`[aerogap] ${signal} received, draining connections`);
    server.close(() => process.exit(0));
    // Do not let a stuck in-flight AI request block the container past the
    // orchestrator's kill timeout.
    setTimeout(() => process.exit(0), 15_000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

// Only auto-start when run as the entrypoint, so tests can import buildApp().
if (process.env.NODE_ENV !== 'test') {
  main();
}
