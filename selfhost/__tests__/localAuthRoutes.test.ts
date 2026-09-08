import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountLocalAuthRoutes } from '../server/src/localAuthRoutes.js';
import { resetRateLimitsForTests } from '../server/src/rateLimit.js';
import { loadOrCreateKeyPair, issuerFor, verifyToken, verifySessionToken } from '../server/src/localAuth.js';

/**
 * The sign-in surface.
 *
 * The end-to-end harness proves this works against a real Convex backend; these
 * tests cover the things that are awkward to provoke there - a database that is
 * down, a hostile cookie, a response that says "no" - and the properties that
 * would be silently wrong rather than visibly broken.
 */
const APP_ORIGIN = 'http://127.0.0.1:19080';
const ISSUER = issuerFor(APP_ORIGIN);

/**
 * The REAL fetch, captured before the stub is installed.
 *
 * The stub below intercepts the routes' outbound calls to Convex - but the test
 * harness also uses fetch to talk to its own express server, and without this it
 * would be answered by the Convex mock instead. Every assertion then failed on
 * an empty response, which looks exactly like the routes being broken.
 */
const realFetch = globalThis.fetch;

let dataRoot: string;
let app: express.Express;
let convexResponse: { ok: boolean; status: number; body: unknown };
let lastConvexCall: any = null;

/** Start a server on an ephemeral port and return a fetch bound to it. */
async function serve() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await realFetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      cookie: response.headers.get('set-cookie') || '',
      body: (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })(),
    };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

beforeEach(() => {
  resetRateLimitsForTests();
  dataRoot = mkdtempSync(join(tmpdir(), 'aerogap-routes-'));
  mkdirSync(join(dataRoot, 'config'), { recursive: true });

  convexResponse = { ok: true, status: 200, body: { ok: true, subject: 'local|abc', email: 'a@b.c' } };
  lastConvexCall = null;

  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    lastConvexCall = JSON.parse(String(init.body));
    return new Response(JSON.stringify(convexResponse.body), { status: convexResponse.status });
  });

  const keyPair = loadOrCreateKeyPair(dataRoot);
  app = express();
  app.use(express.json());
  mountLocalAuthRoutes(app, {
    getKeyPair: () => keyPair,
    appOrigin: APP_ORIGIN,
    convexSiteUrl: 'http://127.0.0.1:14211',
    serviceToken: 'test-service-token',
  });
});

afterEach(() => {
  rmSync(dataRoot, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the session cookie', () => {
  it('is httpOnly and SameSite=Strict', async () => {
    // httpOnly is what stops an XSS from reading it; SameSite=Strict is what
    // stops another site causing an authenticated request.
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    expect(result.cookie).toMatch(/HttpOnly/i);
    expect(result.cookie).toMatch(/SameSite=Strict/i);
    await close();
  });

  it('is NOT marked Secure on a loopback origin', async () => {
    // A Secure cookie is dropped on http://127.0.0.1, so setting it would mean
    // sign-in appears to succeed and the session silently never persists.
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    expect(result.cookie).not.toMatch(/Secure/i);
    await close();
  });

  it('IS marked Secure when the origin is https', async () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const secureApp = express();
    secureApp.use(express.json());
    mountLocalAuthRoutes(secureApp, {
      getKeyPair: () => keyPair,
      appOrigin: 'https://aerogap.acme.local',
      convexSiteUrl: 'http://127.0.0.1:14211',
      serviceToken: 't',
    });
    app = secureApp;

    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    expect(result.cookie).toMatch(/Secure/i);
    await close();
  });

  it('carries a SESSION token, which is not usable as a Convex token', async () => {
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    const value = decodeURIComponent(result.cookie.split(';')[0].split('=').slice(1).join('='));
    const keyPair = loadOrCreateKeyPair(dataRoot);

    expect(verifySessionToken(value, keyPair, { issuer: ISSUER }).ok).toBe(true);
    // The separation that makes the short Convex TTL worth anything.
    expect(verifyToken(value, keyPair, { issuer: ISSUER }).ok).toBe(false);
    await close();
  });
});

describe('hosted-session exchange', () => {
  /** Mount with a stub verifier: the Clerk signature check has its own tests. */
  function mountWithHosted(verify: (token: string) => Promise<any>, profile: (token: string) => Promise<any> = async () => null) {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const hostedApp = express();
    hostedApp.use(express.json());
    mountLocalAuthRoutes(hostedApp, {
      getKeyPair: () => keyPair,
      appOrigin: APP_ORIGIN,
      convexSiteUrl: 'http://127.0.0.1:14211',
      serviceToken: 't',
      hostedIdentity: { verify, profile },
    });
    app = hostedApp;
  }

  it('is not mounted at all when the install trusts no hosted issuer', async () => {
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/hosted-session', { token: 'x.y.z' });
    expect(result.status).toBe(404);
    await close();
  });

  it('turns a verified Clerk token into the same 30-day session a local account gets', async () => {
    mountWithHosted(async (token) => (token === 'good.clerk.token' ? { subject: 'user_2abc' } : null));
    const { call, close } = await serve();

    const result = await call('POST', '/local-auth/hosted-session', { token: 'good.clerk.token' });
    expect(result.status).toBe(200);
    expect(result.body.user.subject).toBe('user_2abc');
    expect(result.cookie).toMatch(/HttpOnly/i);

    // The cookie then mints Convex tokens for the HOSTED subject through the
    // ordinary exchange - which is what lets the page run offline as that user.
    const cookie = result.cookie.split(';')[0];
    const minted = await call('POST', '/local-auth/token', {}, { Cookie: cookie });
    expect(minted.status).toBe(200);
    const keyPair = loadOrCreateKeyPair(dataRoot);
    expect(verifyToken(minted.body.token, keyPair, { issuer: ISSUER })).toMatchObject({
      ok: true,
      claims: { sub: 'user_2abc' },
    });
    await close();
  });

  it('takes email and name from the local users row, never from the request body', async () => {
    mountWithHosted(
      async () => ({ subject: 'user_2abc', email: 'claims@example.com' }),
      async () => ({ email: 'row@example.com', name: 'Row Name' }),
    );
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/hosted-session', {
      token: 'good.clerk.token',
      email: 'attacker@example.com',
      name: 'Attacker',
    });
    expect(result.status).toBe(200);
    expect(result.body.user).toEqual({ subject: 'user_2abc', email: 'row@example.com', name: 'Row Name' });
    await close();
  });

  it('falls back to the verified claims when the row has no profile yet', async () => {
    mountWithHosted(async () => ({ subject: 'user_2abc', email: 'claims@example.com', name: 'Claims' }));
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/hosted-session', { token: 'good.clerk.token' });
    expect(result.body.user).toEqual({ subject: 'user_2abc', email: 'claims@example.com', name: 'Claims' });
    await close();
  });

  it('refuses a token the verifier rejects, without setting a cookie', async () => {
    mountWithHosted(async () => null);
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/hosted-session', { token: 'forged.token.here' });
    expect(result.status).toBe(401);
    expect(result.cookie).toBe('');
    await close();
  });

  it('refuses an empty body', async () => {
    mountWithHosted(async () => ({ subject: 'user_2abc' }));
    const { call, close } = await serve();
    expect((await call('POST', '/local-auth/hosted-session', {})).status).toBe(400);
    expect((await call('POST', '/local-auth/hosted-session', { token: 42 })).status).toBe(400);
    await close();
  });
});

describe('token exchange', () => {
  it('mints a Convex token from a valid cookie', async () => {
    const { call, close } = await serve();
    const signIn = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    const cookie = signIn.cookie.split(';')[0];

    const result = await call('POST', '/local-auth/token', {}, { Cookie: cookie });
    expect(result.status).toBe(200);

    const keyPair = loadOrCreateKeyPair(dataRoot);
    const verified = verifyToken(result.body.token, keyPair, { issuer: ISSUER });
    expect(verified.ok).toBe(true);
    await close();
  });

  it.each([
    ['no cookie', undefined],
    ['a garbage cookie', 'aerogap_session=not-a-token'],
    ['an empty cookie', 'aerogap_session='],
    ['someone else\'s JWT', 'aerogap_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.'],
  ])('refuses to mint with %s', async (_label, cookie) => {
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/token', {}, cookie ? { Cookie: cookie } : {});
    expect(result.status).toBe(401);
    await close();
  });
});

describe('when the database is unreachable', () => {
  it('reports OUR failure, not a wrong password', async () => {
    // Saying "sign-in failed" here sends the user hunting for a problem that is
    // not theirs, and support hunting for a password that was always correct.
    convexResponse = { ok: false, status: 503, body: null };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    expect(result.status).toBe(503);
    expect(String(result.body.error)).toMatch(/temporarily unavailable/i);
    await close();
  });

  it('does not set a cookie on a failed sign-in', async () => {
    convexResponse = { ok: true, status: 200, body: { ok: false, message: 'nope' } };
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'x'.repeat(12) });
    expect(result.status).toBe(401);
    expect(result.cookie).toBe('');
    await close();
  });
});

describe('what reaches the database', () => {
  it('normalises the email before it is stored or stamped into a token', async () => {
    // Convex lower-cases on write. Sending the raw value meant the session token
    // carried a different address than the account, so the same person showed
    // one email after signing up and another after signing in.
    const { call, close } = await serve();
    await call('POST', '/local-auth/sign-in', { email: '  Owner@Example.COM ', password: 'x'.repeat(12) });
    expect(lastConvexCall.email).toBe('owner@example.com');
    await close();
  });

  it('never sends the password anywhere but the sign-in action', async () => {
    const { call, close } = await serve();
    await call('POST', '/local-auth/sign-in', { email: 'a@b.c', password: 'hunter2hunter2' });
    expect(lastConvexCall.action).toBe('signIn');
    expect(lastConvexCall.password).toBe('hunter2hunter2');
    // The subject is generated server-side on sign-up, never accepted from the
    // client - otherwise a caller could choose to be an existing user.
    expect(lastConvexCall.subject).toBeUndefined();
    await close();
  });

  it('generates the subject itself on sign-up, ignoring anything the client sent', async () => {
    convexResponse = { ok: true, status: 200, body: { ok: true, isFirstAccount: true } };
    const { call, close } = await serve();
    await call('POST', '/local-auth/sign-up', {
      email: 'new@example.com',
      password: 'x'.repeat(12),
      subject: 'local|i-picked-this',
    });
    expect(lastConvexCall.subject).not.toBe('local|i-picked-this');
    expect(lastConvexCall.subject).toMatch(/^local\|[0-9a-f-]{36}$/);
    await close();
  });

  it('applies the password length rule before calling the database', async () => {
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-up', { email: 'a@b.c', password: 'short' });
    expect(result.status).toBe(400);
    expect(lastConvexCall).toBeNull();
    await close();
  });
});

describe('session and sign-out', () => {
  it('reports no user rather than erroring when signed out', async () => {
    // The SPA calls this on every load to decide what to render; a 401 would
    // make "not signed in" look like a failure.
    const { call, close } = await serve();
    const result = await call('GET', '/local-auth/session');
    expect(result.status).toBe(200);
    expect(result.body.user).toBeNull();
    await close();
  });

  it('expires the cookie on sign-out', async () => {
    const { call, close } = await serve();
    const result = await call('POST', '/local-auth/sign-out', {});
    expect(result.cookie).toMatch(/Max-Age=0/);
    expect(result.cookie).toMatch(/HttpOnly/i);
    await close();
  });
});

describe('admin password reset', () => {
  /**
   * The only recovery path on this product - there is no reset email, by
   * design. So the question these tests answer is narrow and important: can
   * someone who is not an administrator use it?
   *
   * The route itself deliberately does NOT decide that. It establishes WHO is
   * asking from the session cookie and lets Convex check that subject's role.
   * What is tested here is that the route cannot be talked out of the first
   * half - the identity it forwards must be one the caller proved.
   */
  async function signedInCookie(call: Awaited<ReturnType<typeof serve>>['call']) {
    const result = await call('POST', '/local-auth/sign-in', {
      email: 'admin@shop.local',
      password: 'x'.repeat(12),
    });
    return result.cookie.split(';')[0];
  }

  it('takes the caller from the SESSION, never from the request body', async () => {
    // The attack this closes: posting someone else's subject to be treated as
    // them. The body is ignored; the cookie is authoritative.
    convexResponse = { ok: true, status: 200, body: { ok: true, subject: 'local|admin', email: 'admin@shop.local' } };
    const { call, close } = await serve();
    const cookie = await signedInCookie(call);

    convexResponse = { ok: true, status: 200, body: { ok: true } };
    await call(
      'POST',
      '/local-auth/admin-reset',
      // A caller trying to be treated as somebody else.
      { targetEmail: 'victim@shop.local', newPassword: 'x'.repeat(12), callerSubject: 'local|somebody-else' },
      { Cookie: cookie },
    );

    expect(lastConvexCall.action).toBe('adminResetPassword');
    expect(lastConvexCall.callerSubject).toBe('local|admin');
    expect(lastConvexCall.callerSubject).not.toBe('local|somebody-else');
    // The route also proves to Convex that the subject came from a verified
    // session rather than the request body.
    expect(lastConvexCall.adminAssertion).toBeTruthy();
    await close();
  });

  it('refuses without a session', async () => {
    const { call, close } = await serve();
    lastConvexCall = null;
    const result = await call('POST', '/local-auth/admin-reset', {
      targetEmail: 'victim@shop.local',
      newPassword: 'x'.repeat(12),
    });
    expect(result.status).toBe(401);
    // Never even asked the database.
    expect(lastConvexCall).toBeNull();
    await close();
  });

  it('reports 403 when Convex says the caller is not an administrator', async () => {
    // 403 rather than 400: "you may not do this" and "you asked wrongly" are
    // different things to whoever reads the log.
    convexResponse = { ok: true, status: 200, body: { ok: true, subject: 'local|mechanic', email: 'm@shop.local' } };
    const { call, close } = await serve();
    const cookie = await signedInCookie(call);

    convexResponse = {
      ok: true,
      status: 200,
      body: { ok: false, message: "Only an administrator can reset another user's password." },
    };
    const result = await call(
      'POST',
      '/local-auth/admin-reset',
      { targetEmail: 'victim@shop.local', newPassword: 'x'.repeat(12) },
      { Cookie: cookie },
    );
    expect(result.status).toBe(403);
    await close();
  });

  it('applies the password rule before calling the database', async () => {
    convexResponse = { ok: true, status: 200, body: { ok: true, subject: 'local|admin', email: 'a@b.c' } };
    const { call, close } = await serve();
    const cookie = await signedInCookie(call);

    lastConvexCall = null;
    const result = await call(
      'POST',
      '/local-auth/admin-reset',
      { targetEmail: 'victim@shop.local', newPassword: 'short' },
      { Cookie: cookie },
    );
    expect(result.status).toBe(400);
    expect(lastConvexCall).toBeNull();
    await close();
  });

  it('normalises the target email', async () => {
    convexResponse = { ok: true, status: 200, body: { ok: true, subject: 'local|admin', email: 'a@b.c' } };
    const { call, close } = await serve();
    const cookie = await signedInCookie(call);

    convexResponse = { ok: true, status: 200, body: { ok: true } };
    await call(
      'POST',
      '/local-auth/admin-reset',
      { targetEmail: '  Victim@Shop.LOCAL ', newPassword: 'x'.repeat(12) },
      { Cookie: cookie },
    );
    // Accounts are stored lower-cased; sending the raw value would report "no
    // such account" for an address that plainly exists.
    expect(lastConvexCall.targetEmail).toBe('victim@shop.local');
    await close();
  });
});
