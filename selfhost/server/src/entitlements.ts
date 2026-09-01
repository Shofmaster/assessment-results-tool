/**
 * Entitlement check-in.
 *
 * WHAT IT IS FOR
 * An installed build ships with features switched off. This lets us turn one on
 * for one customer without shipping anything - the "new features to individual
 * users" half of the connectivity requirement. The other half, versions, is
 * updateManifest.cjs.
 *
 * WHAT IT DELIBERATELY DOES NOT SEND
 * A customer chose an on-prem product so their maintenance records would stay
 * on their machine. That promise is worth more than any telemetry we might
 * like, so the check-in carries only:
 *
 *     installId, licenseKey, appVersion, deploymentMode
 *
 * No document text, no tail numbers, no company names, no user identities, no
 * counts of anything. buildCheckInPayload() is the ONLY place a request body is
 * constructed and its shape is pinned by tests, so adding a field is a visible,
 * deliberate act rather than something that drifts in.
 *
 * FAILURE BEHAVIOUR: NEVER LOCK ANYONE OUT
 * A maintenance shop that cannot open its own records mid-audit because our
 * billing server is unreachable is a company that will never trust us again -
 * and the records are theirs, not ours. So:
 *
 *   - an unreachable server serves the last known-good entitlements
 *   - entitlements remain valid for a long grace window after the last contact
 *   - past the grace window the app DEGRADES (read and export) rather than
 *     refusing to open
 *   - a fresh install that has never reached us gets the unlicensed baseline,
 *     which is a usable product
 *
 * At no point does any path here return "closed".
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** How long cached entitlements stay fully valid without contact. */
export const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** How often to attempt a check-in when things are healthy. */
export const CHECK_IN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Network timeout. Short: this must never delay a launch. */
const REQUEST_TIMEOUT_MS = 10_000;

export type EntitlementState = 'licensed' | 'unlicensed' | 'grace' | 'expired';

export interface Entitlements {
  /** Feature keys switched on for this install. */
  enabledFeatures: string[];
  tier: string;
  state: EntitlementState;
  /** Epoch ms of the last successful check-in, or null if never. */
  lastCheckInAt: number | null;
  /** Why the app is in this state, for the Settings panel. */
  reason: string;
}

export interface CheckInPayload {
  installId: string;
  licenseKey: string | null;
  appVersion: string;
  deploymentMode: string;
}

/**
 * What an install that has never successfully checked in is allowed to do.
 *
 * Deliberately a working product rather than a locked shell: the paywall gates
 * AI features, not the ability to open the app and read your own records.
 */
export const UNLICENSED_BASELINE: Entitlements = {
  enabledFeatures: [],
  tier: 'unlicensed',
  state: 'unlicensed',
  lastCheckInAt: null,
  reason: 'No license has been activated. Add one under Settings > Activation.',
};

/**
 * Copy an entitlement record, INCLUDING its feature array.
 *
 * A spread alone is a shallow copy, so every result derived from
 * UNLICENSED_BASELINE would share one array instance: a single caller doing
 * `result.enabledFeatures.push(...)` would silently grant that feature to every
 * later unlicensed install in the process. Caught by a test rather than in
 * production, which is the only reason this comment is short.
 */
function clone(source: Entitlements, overrides: Partial<Entitlements> = {}): Entitlements {
  return { ...source, enabledFeatures: [...source.enabledFeatures], ...overrides };
}

/**
 * The ONLY place a check-in body is built.
 *
 * Centralised so the privacy claim is testable in one assertion rather than
 * being a property of however many call sites there happen to be.
 */
export function buildCheckInPayload(input: {
  installId: string;
  licenseKey?: string | null;
  appVersion: string;
  deploymentMode: string;
}): CheckInPayload {
  return {
    installId: input.installId,
    licenseKey: input.licenseKey?.trim() || null,
    appVersion: input.appVersion,
    deploymentMode: input.deploymentMode,
  };
}

/**
 * Decide the state from a cached record and the clock.
 *
 * Pure, so the grace/expiry behaviour can be tested without a network, a
 * filesystem or a fake timer library.
 */
export function evaluateCache(
  cached: { entitlements: Entitlements; fetchedAt: number } | null,
  now: number,
): Entitlements {
  if (!cached) return clone(UNLICENSED_BASELINE);

  const age = now - cached.fetchedAt;
  const unlicensed = cached.entitlements.tier === 'unlicensed';

  if (age <= CHECK_IN_INTERVAL_MS) {
    return clone(cached.entitlements, { state: unlicensed ? 'unlicensed' : 'licensed' });
  }

  if (age <= GRACE_WINDOW_MS) {
    // Stale but honoured. The customer has paid; we simply have not been able
    // to confirm it lately, which is our problem and not theirs.
    return clone(cached.entitlements, {
      state: unlicensed ? 'unlicensed' : 'grace',
      reason: `Last confirmed ${Math.floor(age / 86_400_000)} days ago. Features remain available.`,
    });
  }

  // Past grace. Features that cost us money per use stop; everything the
  // customer needs to read and export their own records keeps working.
  return clone(cached.entitlements, {
    enabledFeatures: [],
    state: 'expired',
    reason:
      'This license has not been confirmed in over 30 days. Your records remain fully readable and ' +
      'exportable; AI features are paused until the app can reach the licensing server.',
  });
}

/** Where the cache lives. Beside the other per-install state. */
export function cachePath(dataRoot: string): string {
  return join(dataRoot, 'config', 'entitlements.json');
}

export function readCache(dataRoot: string): { entitlements: Entitlements; fetchedAt: number } | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(dataRoot), 'utf8'));
    if (!parsed?.entitlements || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    // A missing or corrupt cache is the same as never having checked in. It
    // must not be able to stop the app from starting.
    return null;
  }
}

export function writeCache(dataRoot: string, entitlements: Entitlements, fetchedAt: number): void {
  const file = cachePath(dataRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ entitlements, fetchedAt }, null, 2), 'utf8');
}

/**
 * Contact the licensing server.
 *
 * Returns null on ANY failure - unreachable, timeout, non-200, malformed body.
 * The caller falls back to cache. This function never throws, because a
 * licensing check must not be able to take down an install.
 */
export async function fetchEntitlements(
  endpoint: string,
  payload: CheckInPayload,
): Promise<Entitlements | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const body = (await response.json()) as Partial<Entitlements> | null;
    if (!body || !Array.isArray(body.enabledFeatures)) return null;

    return {
      // Filter to strings: the server is ours, but a bad deploy sending
      // objects here should degrade to "no features" rather than poison the
      // cache with values the UI will choke on.
      enabledFeatures: body.enabledFeatures.filter((f): f is string => typeof f === 'string'),
      tier: typeof body.tier === 'string' ? body.tier : 'unlicensed',
      state: 'licensed',
      lastCheckInAt: Date.now(),
      reason: typeof body.reason === 'string' ? body.reason : 'Active.',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve entitlements: try the server, fall back to cache, never fail.
 */
export async function resolveEntitlements(options: {
  endpoint: string | null;
  dataRoot: string;
  payload: CheckInPayload;
  now?: number;
}): Promise<Entitlements> {
  const { endpoint, dataRoot, payload } = options;
  const now = options.now ?? Date.now();

  if (endpoint) {
    const fresh = await fetchEntitlements(endpoint, payload);
    if (fresh) {
      writeCache(dataRoot, fresh, now);
      return fresh;
    }
  }

  return evaluateCache(readCache(dataRoot), now);
}

/**
 * Persist an activated license key.
 *
 * Written into config/.env rather than held in memory, because the licensing
 * server is consulted on every launch and an install that forgot its key would
 * silently drop to unlicensed after a restart - reported as "it stopped working
 * overnight", which is a hard bug to find and an easy one to prevent.
 *
 * Rewrites the existing line rather than appending: appending a second
 * AEROGAP_LICENSE_KEY would leave the file with two, and which one wins depends
 * on parse order - exactly the kind of thing that works until it doesn't.
 */
export function persistLicenseKey(dataRoot: string, licenseKey: string): void {
  const file = join(dataRoot, 'config', '.env');
  mkdirSync(dirname(file), { recursive: true });

  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    // Fresh install; the file is created below.
  }

  const line = `AEROGAP_LICENSE_KEY=${licenseKey}`;
  const pattern = /^\s*AEROGAP_LICENSE_KEY\s*=.*$/m;

  if (pattern.test(text)) {
    text = text.replace(pattern, line);
  } else {
    if (text && !text.endsWith('\n')) text += '\n';
    text += `${line}\n`;
  }

  writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
  // So the running process uses it immediately rather than after a restart.
  process.env.AEROGAP_LICENSE_KEY = licenseKey;
}

/** One line for the startup banner. */
export function describeEntitlements(e: Entitlements): string {
  return `entitlements     ${e.tier} (${e.state}), ${e.enabledFeatures.length} feature(s) enabled`;
}

/** True when the check-in endpoint is configured for this install. */
export function entitlementEndpoint(): string | null {
  const url = (process.env.AEROGAP_ENTITLEMENT_URL || '').trim();
  if (!url) return null;
  // Refuse a plain-http licensing endpoint: the response decides what the app
  // will do, so it must not be modifiable in transit.
  if (!/^https:\/\//i.test(url)) {
    console.warn('[aerogap] AEROGAP_ENTITLEMENT_URL must be https - ignoring it.');
    return null;
  }
  return url;
}

/** Present for tests that need to assert on the on-disk shape. */
export const _internals = { existsSync };
