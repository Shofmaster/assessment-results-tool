import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * This module is the gate that stops an unapproved account from spending a
 * customer's AI balance. Its cardinal rule is that it fails CLOSED on every
 * leg - a missing secret, a missing CONVEX_URL, or an unreachable Convex must
 * all reject, never wave the request through.
 *
 * Caching the approval verdict (api/_lib/approvalCache.ts) is a performance
 * change made underneath that rule, so most of what follows exists to prove
 * the cache cannot become a bypass: it never holds a failure, it never
 * outlives its short TTL, and it is never consulted by a runtime that is not
 * configured to check approvals in the first place.
 */

const verifyToken = vi.hoisted(() => vi.fn());
const convexQuery = vi.hoisted(() => vi.fn());
const setAuth = vi.hoisted(() => vi.fn());

vi.mock('@clerk/backend', () => ({ verifyToken }));
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    setAuth = setAuth;
    query = convexQuery;
  },
}));

import { verifyRequestAuth } from './auth.js';
import { _resetApprovalCache, _APPROVAL_CACHE_LIMITS } from './approvalCache.js';
import { _CACHE_LIMITS } from './aiCredentialCache.js';

const ENV_KEYS = [
  'CLERK_SECRET_KEY',
  // Must be managed here even though most tests never set it: it is an
  // ALTERNATIVE credential, so a stray value in the ambient environment would
  // satisfy the guard and silently defeat the "no credential" tests below.
  'CLERK_JWT_KEY',
  'CONVEX_URL',
  'VITE_CONVEX_URL',
  'CLERK_JWT_AUDIENCE',
];
let saved: Record<string, string | undefined> = {};

/** A request carrying a well-formed bearer token. */
function req(token = 'jwt-abc') {
  return { headers: { authorization: `Bearer ${token}` } };
}

/** Clerk accepts the token and reports this user. */
function clerkAccepts(sub = 'user_1') {
  verifyToken.mockResolvedValue({ sub });
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.CLERK_SECRET_KEY = 'sk_test_secret';
  process.env.CONVEX_URL = 'https://example.convex.cloud';
  _resetApprovalCache();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  vi.restoreAllMocks();
});

describe('fail-closed configuration legs', () => {
  it('rejects with 503 when CLERK_SECRET_KEY is unset, without reaching Convex', async () => {
    delete process.env.CLERK_SECRET_KEY;
    const out = await verifyRequestAuth(req());
    expect(out).toMatchObject({ ok: false, status: 503 });
    expect(convexQuery).not.toHaveBeenCalled();
  });

  it('rejects with 503 when CONVEX_URL is unset, even for a valid token', async () => {
    delete process.env.CONVEX_URL;
    clerkAccepts();
    const out = await verifyRequestAuth(req());
    expect(out).toMatchObject({ ok: false, status: 503 });
    expect(convexQuery).not.toHaveBeenCalled();
  });

  it('does NOT serve a cached approval to a runtime that lost CONVEX_URL', async () => {
    // The cache must never let an unconfigured runtime coast on a verdict it
    // recorded while it was configured.
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: true });

    delete process.env.CONVEX_URL;
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: false, status: 503 });
  });
});

describe('token verification', () => {
  it.each([
    ['absent', {}],
    ['not a bearer scheme', { authorization: 'Basic abc' }],
    ['bearer with no token', { authorization: 'Bearer   ' }],
  ])('rejects with 401 when the header is %s', async (_label, headers) => {
    const out = await verifyRequestAuth({ headers });
    expect(out).toMatchObject({ ok: false, status: 401 });
    expect(convexQuery).not.toHaveBeenCalled();
  });

  it('rejects with 401 when Clerk rejects the token on both paths', async () => {
    verifyToken.mockRejectedValue(new Error('bad signature'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await verifyRequestAuth(req());
    expect(out).toMatchObject({ ok: false, status: 401 });
    expect(convexQuery).not.toHaveBeenCalled();
  });
});

describe('approval verdicts', () => {
  it('admits an approved user and echoes the verified token back', async () => {
    clerkAccepts('user_ok');
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    const out = await verifyRequestAuth(req('jwt-xyz'));
    expect(out).toEqual({ ok: true, userId: 'user_ok', token: 'jwt-xyz' });
  });

  it('admits a grandfathered row with no approvalStatus field', async () => {
    clerkAccepts();
    convexQuery.mockResolvedValue({});
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: true });
  });

  it.each(['pending', 'rejected'])('blocks a %s account with 403', async (status) => {
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: status });
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects with 503 when Convex is unreachable', async () => {
    clerkAccepts();
    convexQuery.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: false, status: 503 });
  });
});

describe('approval caching', () => {
  it('does not re-query Convex for an approved user within the TTL', async () => {
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    await verifyRequestAuth(req());
    await verifyRequestAuth(req());
    await verifyRequestAuth(req());
    expect(convexQuery).toHaveBeenCalledTimes(1);
  });

  it('keeps blocking a pending user from cache, without re-querying', async () => {
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'pending' });
    expect(await verifyRequestAuth(req())).toMatchObject({ status: 403 });
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: false, status: 403 });
    expect(convexQuery).toHaveBeenCalledTimes(1);
  });

  it('caches per user rather than globally', async () => {
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    verifyToken.mockResolvedValueOnce({ sub: 'user_a' }).mockResolvedValueOnce({ sub: 'user_b' });
    await verifyRequestAuth(req());
    await verifyRequestAuth(req());
    expect(convexQuery).toHaveBeenCalledTimes(2);
  });

  it('re-queries once the TTL expires, so a revoked account loses access', async () => {
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    const realNow = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(realNow);

    expect(await verifyRequestAuth(req())).toMatchObject({ ok: true });

    clock.mockReturnValue(realNow + _APPROVAL_CACHE_LIMITS.TTL_MS + 1);
    convexQuery.mockResolvedValue({ approvalStatus: 'rejected' });

    expect(await verifyRequestAuth(req())).toMatchObject({ ok: false, status: 403 });
    expect(convexQuery).toHaveBeenCalledTimes(2);
  });

  it('never caches a failed check: an outage re-checks on every request', async () => {
    clerkAccepts();
    convexQuery.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await verifyRequestAuth(req())).toMatchObject({ status: 503 });
    expect(await verifyRequestAuth(req())).toMatchObject({ status: 503 });
    expect(convexQuery).toHaveBeenCalledTimes(2);

    // ...and the moment Convex recovers, the very next request is admitted.
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: true });
  });

  it('an outage cannot revoke an approval already cached, nor grant a new one', async () => {
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });
    await verifyRequestAuth(req());

    convexQuery.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The cached user rides out the outage; a different user is refused.
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: true });
    verifyToken.mockResolvedValue({ sub: 'stranger' });
    expect(await verifyRequestAuth(req())).toMatchObject({ ok: false, status: 503 });
  });

  it('expires much faster than the AI credential cache', () => {
    // An access-control verdict is not a performance detail. If someone ever
    // "harmonises" these two TTLs, this is the test that should stop them.
    expect(_APPROVAL_CACHE_LIMITS.TTL_MS).toBeLessThanOrEqual(15_000);
    expect(_APPROVAL_CACHE_LIMITS.TTL_MS).toBeLessThan(_CACHE_LIMITS.HIT_TTL_MS);
  });
});

/**
 * Which credential verifies the signature.
 *
 * The hosted Vercel deployment uses CLERK_SECRET_KEY and always has. A
 * distributed desktop build cannot: shipping a secret key inside every
 * customer's install directory would put our whole Clerk tenant one file read
 * away from compromise, and rotating it would mean re-shipping the installer to
 * every site. CLERK_JWT_KEY is the public verification PEM and is safe to ship,
 * so it is preferred when present.
 *
 * What must NOT change is the fail-closed rule: having neither is still a 503.
 */
describe('verification credential selection', () => {
  it('accepts CLERK_JWT_KEY with no secret key present', async () => {
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_JWT_KEY = 'public-pem';
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });

    const out = await verifyRequestAuth(req());
    expect(out).toMatchObject({ ok: true, userId: 'user_1' });
  });

  it('passes the PEM to Clerk as jwtKey, never as a secret', async () => {
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_JWT_KEY = 'public-pem';
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });

    await verifyRequestAuth(req());

    const options = verifyToken.mock.calls[0][1];
    expect(options).toMatchObject({ jwtKey: 'public-pem' });
    expect(options).not.toHaveProperty('secretKey');
  });

  it('prefers the JWT key when both are configured', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_secret';
    process.env.CLERK_JWT_KEY = 'public-pem';
    clerkAccepts();
    convexQuery.mockResolvedValue({ approvalStatus: 'approved' });

    await verifyRequestAuth(req());

    // Networkless verification beats a round trip to Clerk's JWKS endpoint, and
    // on a customer machine that round trip is also a hard dependency on our
    // vendor being reachable.
    expect(verifyToken.mock.calls[0][1]).toMatchObject({ jwtKey: 'public-pem' });
  });

  it('still rejects with 503 when NEITHER credential is configured', async () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_KEY;

    const out = await verifyRequestAuth(req());
    expect(out).toMatchObject({ ok: false, status: 503 });
    expect(out.message).toMatch(/CLERK_JWT_KEY/);
    // The guard must not become a no-op, and must not reach Convex either.
    expect(verifyToken).not.toHaveBeenCalled();
    expect(convexQuery).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only credential as absent', async () => {
    // A blank line in an .env file parses to an empty string, which is not a
    // credential - accepting it would produce a confusing verify failure
    // instead of a clear configuration error.
    process.env.CLERK_SECRET_KEY = '   ';
    process.env.CLERK_JWT_KEY = '';

    const out = await verifyRequestAuth(req());
    expect(out).toMatchObject({ ok: false, status: 503 });
  });
});
