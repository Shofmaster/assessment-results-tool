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
