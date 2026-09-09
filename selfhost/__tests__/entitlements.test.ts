import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCheckInPayload,
  evaluateCache,
  resolveEntitlements,
  fetchEntitlements,
  readCache,
  writeCache,
  cachePath,
  entitlementEndpoint,
  UNLICENSED_BASELINE,
  GRACE_WINDOW_MS,
  CHECK_IN_INTERVAL_MS,
  type Entitlements,
} from '../server/src/entitlements.js';

/**
 * Two promises are being tested here, and both are commercial rather than
 * technical.
 *
 * PRIVACY: a customer chose on-prem so their maintenance records would stay on
 * their machine. If the check-in ever carries document text, tail numbers or
 * user identities, we have quietly broken the thing they bought.
 *
 * AVAILABILITY: a shop locked out of its own records mid-audit because our
 * licensing server was unreachable is a customer lost permanently. There is no
 * code path here that may return "closed" - not an outage, not a corrupt cache,
 * not an expired license.
 */
let dataRoot: string;

const licensed: Entitlements = {
  enabledFeatures: ['ai.analysis', 'ai.audit-sim'],
  tier: 'professional',
  state: 'licensed',
  lastCheckInAt: 1_000,
  reason: 'Active.',
};

beforeEach(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'aerogap-ent-'));
  mkdirSync(join(dataRoot, 'config'), { recursive: true });
});

afterEach(() => {
  rmSync(dataRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.AEROGAP_ENTITLEMENT_URL;
});

describe('what the check-in is allowed to send', () => {
  it('sends only the four identifying fields', () => {
    // The privacy claim, as one assertion. Adding a field to the payload has to
    // fail this test, so it becomes a deliberate decision rather than a drift.
    const payload = buildCheckInPayload({
      installId: 'install-uuid',
      licenseKey: 'AG-XXXX',
      appVersion: '0.5.0',
      deploymentMode: 'desktop',
    });

    expect(Object.keys(payload).sort()).toEqual([
      'appVersion',
      'deploymentMode',
      'installId',
      'licenseKey',
    ]);
  });

  it('carries no customer data even when asked to', () => {
    const payload = buildCheckInPayload({
      installId: 'i',
      appVersion: '0.5.0',
      deploymentMode: 'desktop',
      // @ts-expect-error deliberately passing things that must not survive
      companyName: 'Acme Aviation',
      tailNumbers: ['N12345'],
      userEmail: 'chief@acme.example',
      documentCount: 4210,
    });

    const serialized = JSON.stringify(payload);
    for (const leak of ['Acme', 'N12345', 'chief@acme.example', '4210']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('normalises a blank license key to null rather than sending whitespace', () => {
    expect(buildCheckInPayload({ installId: 'i', licenseKey: '   ', appVersion: '1', deploymentMode: 'desktop' }).licenseKey).toBeNull();
  });
});

describe('an install that has never reached us', () => {
  it('gets a usable unlicensed baseline, not a lockout', () => {
    expect(evaluateCache(null, Date.now())).toMatchObject({
      state: 'unlicensed',
      tier: 'unlicensed',
    });
  });

  it('is unaffected by a corrupt cache file', () => {
    // A damaged cache must behave like no cache. It must never be able to stop
    // the app from starting.
    writeFileSync(cachePath(dataRoot), '{ not json', 'utf8');
    expect(readCache(dataRoot)).toBeNull();
    expect(evaluateCache(readCache(dataRoot), Date.now())).toMatchObject({ state: 'unlicensed' });
  });
});

describe('grace, and the refusal to lock anyone out', () => {
  const now = 1_000_000_000_000;

  it('serves fresh entitlements normally', () => {
    const result = evaluateCache({ entitlements: licensed, fetchedAt: now - 1000 }, now);
    expect(result.state).toBe('licensed');
    expect(result.enabledFeatures).toEqual(['ai.analysis', 'ai.audit-sim']);
  });

  it('keeps every feature working inside the grace window', () => {
    // Days without contact. The customer has paid; our inability to confirm it
    // is our problem, not theirs.
    const result = evaluateCache(
      { entitlements: licensed, fetchedAt: now - (CHECK_IN_INTERVAL_MS + 86_400_000) },
      now,
    );
    expect(result.state).toBe('grace');
    expect(result.enabledFeatures).toEqual(['ai.analysis', 'ai.audit-sim']);
  });

  it('honours the full 30 days', () => {
    const result = evaluateCache({ entitlements: licensed, fetchedAt: now - (GRACE_WINDOW_MS - 1000) }, now);
    expect(result.state).toBe('grace');
    expect(result.enabledFeatures.length).toBeGreaterThan(0);
  });

  it('DEGRADES past the grace window instead of refusing to open', () => {
    // The single most important test in this file. Past expiry the paid
    // features pause - but the app still opens and the customer's own records
    // stay readable and exportable. There is no state that returns "closed".
    const result = evaluateCache({ entitlements: licensed, fetchedAt: now - (GRACE_WINDOW_MS + 1) }, now);

    expect(result.state).toBe('expired');
    expect(result.enabledFeatures).toEqual([]);
    expect(result.reason).toMatch(/readable and exportable/i);
  });

  it('never produces a state that means locked out', () => {
    const ages = [0, CHECK_IN_INTERVAL_MS + 1, GRACE_WINDOW_MS - 1, GRACE_WINDOW_MS + 1, GRACE_WINDOW_MS * 10];
    for (const age of ages) {
      const result = evaluateCache({ entitlements: licensed, fetchedAt: now - age }, now);
      expect(['licensed', 'grace', 'expired', 'unlicensed']).toContain(result.state);
    }
  });
});

describe('talking to the licensing server', () => {
  const payload = buildCheckInPayload({
    installId: 'i',
    licenseKey: 'AG-1',
    appVersion: '0.5.0',
    deploymentMode: 'desktop',
  });

  it('caches a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ enabledFeatures: ['ai.analysis'], tier: 'professional' }), { status: 200 })),
    );

    const result = await resolveEntitlements({
      endpoint: 'https://licensing.example.com/checkin',
      dataRoot,
      payload,
    });

    expect(result.enabledFeatures).toEqual(['ai.analysis']);
    expect(readCache(dataRoot)?.entitlements.tier).toBe('professional');
  });

  it('falls back to cache when the server is unreachable', async () => {
    // The offline case. The app must start and work exactly as it did.
    writeCache(dataRoot, licensed, Date.now());
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND'); }));

    const result = await resolveEntitlements({
      endpoint: 'https://licensing.example.com/checkin',
      dataRoot,
      payload,
    });

    expect(result.enabledFeatures).toEqual(['ai.analysis', 'ai.audit-sim']);
  });

  it.each([500, 502, 404, 403])('falls back to cache on HTTP %i', async (status) => {
    writeCache(dataRoot, licensed, Date.now());
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));

    const result = await resolveEntitlements({
      endpoint: 'https://licensing.example.com/checkin',
      dataRoot,
      payload,
    });
    expect(result.enabledFeatures.length).toBe(2);
  });

  it('does not overwrite a good cache with a malformed response', async () => {
    // A bad deploy on our side must not strip a paying customer's features.
    writeCache(dataRoot, licensed, Date.now());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ nonsense: true }), { status: 200 })));

    const result = await resolveEntitlements({
      endpoint: 'https://licensing.example.com/checkin',
      dataRoot,
      payload,
    });
    expect(result.enabledFeatures).toEqual(['ai.analysis', 'ai.audit-sim']);
  });

  it('discards non-string feature keys rather than caching them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ enabledFeatures: ['ok', { bad: 1 }, 42], tier: 'pro' }), { status: 200 })),
    );
    const result = await fetchEntitlements('https://licensing.example.com/checkin', payload);
    expect(result?.enabledFeatures).toEqual(['ok']);
  });

  it('works with no endpoint configured at all', async () => {
    // A build with no licensing server still has to run.
    const result = await resolveEntitlements({ endpoint: null, dataRoot, payload });
    expect(result).toMatchObject({ state: 'unlicensed' });
  });

  it('never throws, whatever fetch does', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    await expect(
      resolveEntitlements({ endpoint: 'https://licensing.example.com/checkin', dataRoot, payload }),
    ).resolves.toBeDefined();
  });
});

describe('endpoint configuration', () => {
  it('refuses a plain-http licensing endpoint', () => {
    // The response decides what the app will do, so it must not be modifiable
    // in transit by anyone on the customer's network.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.AEROGAP_ENTITLEMENT_URL = 'http://licensing.example.com/checkin';
    expect(entitlementEndpoint()).toBeNull();
  });

  it('accepts https', () => {
    process.env.AEROGAP_ENTITLEMENT_URL = 'https://licensing.example.com/checkin';
    expect(entitlementEndpoint()).toBe('https://licensing.example.com/checkin');
  });

  it('is null when unset', () => {
    expect(entitlementEndpoint()).toBeNull();
  });
});

describe('the cache on disk', () => {
  it('round-trips', () => {
    writeCache(dataRoot, licensed, 12345);
    expect(readCache(dataRoot)).toEqual({ entitlements: licensed, fetchedAt: 12345 });
  });

  it('stores no customer data', () => {
    writeCache(dataRoot, licensed, 12345);
    const raw = readFileSync(cachePath(dataRoot), 'utf8');
    expect(raw).not.toMatch(/@|tail|N\d{4}/i);
  });

  it('leaves the unlicensed baseline immutable', () => {
    // It is spread into results in several places; a mutation would silently
    // change what every future unlicensed install is allowed to do.
    const before = JSON.stringify(UNLICENSED_BASELINE);
    const result = evaluateCache(null, Date.now());
    result.enabledFeatures.push('sneaky');
    expect(JSON.stringify(UNLICENSED_BASELINE)).toBe(before);
  });
});
