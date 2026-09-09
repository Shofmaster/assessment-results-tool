/**
 * Sign-in, sign-up and session routes for a self-hosted install.
 *
 * THE SHAPE, AND WHY
 * The browser never holds a long-lived credential it could leak through XSS or
 * a copied localStorage value. Instead:
 *
 *   POST /local-auth/sign-in   verifies the password IN CONVEX, then sets an
 *                              httpOnly session cookie
 *   POST /local-auth/token     exchanges that cookie for a SHORT-LIVED Convex
 *                              token the SPA holds in memory only
 *   GET  /local-auth/session   who am I, for deciding what to render
 *   POST /local-auth/sign-out  clears the cookie
 *
 * The cookie is httpOnly and SameSite=Strict, so page JavaScript cannot read it
 * and another site cannot cause it to be sent. The Convex token it mints lives
 * an hour and has a different audience, so the two cannot be substituted for
 * each other.
 *
 * WHY NOT JUST RETURN THE CONVEX TOKEN AT SIGN-IN
 * Because then the browser would need to keep something for weeks to avoid
 * re-prompting, and the only places to keep it are readable by script. The
 * cookie is the long-lived half precisely so that the half JavaScript touches
 * is the short one.
 */
import type { Express, Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import {
  issuerFor,
  mintSessionToken,
  mintToken,
  newSubject,
  normalizeEmail,
  validatePassword,
  verifySessionToken,
  type LocalKeyPair,
} from './localAuth.js';
import type { HostedIdentity } from './hostedIdentity.js';
import { applyRateLimit } from './rateLimit.js';

const COOKIE_NAME = 'aerogap_session';

/** How long the browser keeps the cookie. Matches the token's own expiry. */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface LocalAuthDeps {
  getKeyPair: () => LocalKeyPair | null;
  appOrigin: string;
  /** Convex HTTP-actions base URL, e.g. http://127.0.0.1:14211 */
  convexSiteUrl: string;
  serviceToken: string;
  /**
   * Verifier for hosted (Clerk) tokens, present only on an install that trusts
   * a hosted issuer beside its own (AUTH_MODE=both). Enables
   * POST /local-auth/hosted-session. See hostedIdentity.ts.
   */
  hostedIdentity?: HostedIdentity | null;
}

/*
 * NOTE ON MIRRORING INTO `users`.
 *
 * There is deliberately no hook here to create the `users` row. AuthGate already
 * calls `upsertUser` whenever a Convex session appears, and it does so as the
 * SIGNED-IN USER - so the row is written by an authenticated caller through the
 * ordinary path, exactly as it is on the hosted product.
 *
 * An earlier version had this route create the row itself using the service
 * token. That would have been a second, service-authenticated way to write user
 * records, existing only on self-hosted installs - more surface, one more thing
 * to keep in step with the hosted behaviour, and no benefit.
 */

/** Parse the Cookie header. No dependency: the format is trivial and one-way. */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function setSessionCookie(res: Response, value: string, secure: boolean): void {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    // Strict, not Lax: nothing in this app is reached by following a link from
    // another site, so there is no flow to break, and Strict is what stops a
    // hostile page causing an authenticated request.
    'SameSite=Strict',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ];
  // Only over https. On a desktop install the origin is http://127.0.0.1, where
  // Secure would prevent the cookie being stored at all - and loopback is not a
  // network an attacker can sit on anyway.
  if (secure) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(res: Response, secure: boolean): void {
  const attributes = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (secure) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

/** Call the service-token-gated Convex route. */
async function callConvex(
  deps: LocalAuthDeps,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: any }> {
  const response = await fetch(`${deps.convexSiteUrl.replace(/\/+$/, '')}/internal/local-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aerogap-service-token': deps.serviceToken,
    },
    body: JSON.stringify(payload),
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function adminAssertion(serviceToken: string, callerSubject: string): string {
  return createHmac('sha256', serviceToken.trim())
    .update(`admin-reset:${callerSubject}`)
    .digest('base64url');
}

export function mountLocalAuthRoutes(app: Express, deps: LocalAuthDeps): void {
  const issuer = issuerFor(deps.appOrigin);
  const secureCookie = deps.appOrigin.startsWith('https://');

  /** The identity a request's cookie proves, or null. */
  const sessionOf = (req: Request) => {
    const keyPair = deps.getKeyPair();
    if (!keyPair) return null;
    const raw = readCookie(req, COOKIE_NAME);
    if (!raw) return null;
    const verified = verifySessionToken(raw, keyPair, { issuer });
    return verified.ok ? verified.claims : null;
  };

  app.post('/local-auth/sign-in', async (req, res) => {
    if (applyRateLimit(req, res, 20)) return;

    const keyPair = deps.getKeyPair();
    if (!keyPair) {
      res.status(503).json({ error: 'Local authentication is not initialised.' });
      return;
    }

    // Normalised for the same reason, though sign-in also re-normalises inside
    // Convex - the address is echoed back into the session token from here.
    const email = normalizeEmail(String(req.body?.email || ''));
    const password = String(req.body?.password || '');
    if (!email || !password) {
      res.status(400).json({ error: 'Enter your email address and password.' });
      return;
    }

    const result = await callConvex(deps, { action: 'signIn', email, password });
    if (!result.ok) {
      // A failure HERE is ours, not the user's - the service token is wrong, or
      // the database is unreachable. Saying "wrong password" would send them
      // hunting for a problem that is not theirs.
      console.error('[aerogap] local sign-in call failed:', result.status, result.body);
      res.status(503).json({ error: 'Sign-in is temporarily unavailable on this machine.' });
      return;
    }

    if (!result.body?.ok) {
      // 401 whatever the reason. The message from Convex is already written to
      // avoid revealing whether the account exists.
      res.status(401).json({ error: result.body?.message || 'Sign-in failed.' });
      return;
    }

    const { subject, email: storedEmail, name } = result.body;
    setSessionCookie(
      res,
      mintSessionToken(keyPair, { issuer, subject, email: storedEmail, name }),
      secureCookie,
    );
    res.status(200).json({ user: { subject, email: storedEmail, name: name ?? null } });
  });

  app.post('/local-auth/sign-up', async (req, res) => {
    if (applyRateLimit(req, res, 10)) return;

    const keyPair = deps.getKeyPair();
    if (!keyPair) {
      res.status(503).json({ error: 'Local authentication is not initialised.' });
      return;
    }

    // NORMALISED here, not just trimmed. Convex lower-cases before storing, so
    // minting a session token from the raw input stamped a different address
    // into the token than the one on the account - the same person then showed
    // one email straight after signing up and another after signing in, and any
    // lookup keyed on email would see two users. Caught by the end-to-end check.
    const email = normalizeEmail(String(req.body?.email || ''));
    const password = String(req.body?.password || '');
    const name = req.body?.name ? String(req.body.name).trim() : undefined;

    // Checked here as well as in Convex so the user gets the length rule
    // immediately, rather than after a round trip.
    const policy = validatePassword(password);
    if (!policy.ok) {
      res.status(400).json({ error: policy.message });
      return;
    }

    const subject = newSubject();
    const result = await callConvex(deps, {
      action: 'createAccount',
      subject,
      email,
      password,
      name,
    });

    if (!result.ok) {
      console.error('[aerogap] local sign-up call failed:', result.status, result.body);
      res.status(503).json({ error: 'Account creation is temporarily unavailable on this machine.' });
      return;
    }
    if (!result.body?.ok) {
      res.status(400).json({ error: result.body?.message || 'The account could not be created.' });
      return;
    }

    setSessionCookie(res, mintSessionToken(keyPair, { issuer, subject, email, name }), secureCookie);
    res.status(200).json({
      user: { subject, email, name: name ?? null },
      isFirstAccount: Boolean(result.body.isFirstAccount),
    });
  });

  /**
   * Exchange a HOSTED (Clerk) token for this install's own 30-day session.
   *
   * WHY
   * Clerk tokens live a minute and only Clerk's script - which needs the
   * internet - can refresh them. Without this, a desktop user signed in with
   * their AeroGap account is signed out a minute after the connection drops.
   * With it, the SPA obtains a local session for the SAME subject while online,
   * and when the connection goes it reloads onto the local provider and keeps
   * working as the same `users` row (keyed by that subject on both paths).
   *
   * WHAT IS TRUSTED
   * The token's signature, verified offline against the tenant's public key.
   * Email and name come from the local `users` row that the online sign-in
   * already wrote from Clerk's verified profile - never from the request body.
   * Only present when the install trusts a hosted issuer (AUTH_MODE=both).
   */
  if (deps.hostedIdentity) {
    const hosted = deps.hostedIdentity;
    app.post('/local-auth/hosted-session', async (req, res) => {
      if (applyRateLimit(req, res, 30)) return;

      const keyPair = deps.getKeyPair();
      if (!keyPair) {
        res.status(503).json({ error: 'Local authentication is not initialised.' });
        return;
      }

      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!token) {
        res.status(400).json({ error: 'A hosted session token is required.' });
        return;
      }

      const claims = await hosted.verify(token);
      if (!claims) {
        res.status(401).json({ error: 'The hosted session could not be verified.' });
        return;
      }

      const profile = await hosted.profile(token);
      const email = profile?.email ?? claims.email;
      const name = profile?.name ?? claims.name;

      setSessionCookie(
        res,
        mintSessionToken(keyPair, { issuer, subject: claims.subject, email, name }),
        secureCookie,
      );
      res.status(200).json({ user: { subject: claims.subject, email: email ?? null, name: name ?? null } });
    });
  }

  /**
   * Exchange the session cookie for a short-lived Convex token.
   *
   * The SPA calls this on load and again before expiry. It is deliberately a
   * separate endpoint from /session: rendering the UI needs to know WHO you are
   * far more often than it needs a fresh credential, and minting a signature on
   * every page render would be waste.
   */
  app.post('/local-auth/token', (req, res) => {
    const keyPair = deps.getKeyPair();
    const claims = sessionOf(req);
    if (!keyPair || !claims) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }

    res.status(200).json({
      token: mintToken(keyPair, {
        issuer,
        subject: claims.sub,
        email: claims.email,
        name: claims.name,
      }),
    });
  });

  app.get('/local-auth/session', (req, res) => {
    const claims = sessionOf(req);
    if (!claims) {
      res.status(200).json({ user: null });
      return;
    }
    res.status(200).json({
      user: { subject: claims.sub, email: claims.email ?? null, name: claims.name ?? null },
    });
  });

  /**
   * Is this a fresh installation?
   *
   * Its own endpoint rather than a field on /session, which the SPA polls on
   * every load: this answer changes exactly once in the life of an install, and
   * putting it on the session route would mean a Convex round trip on every
   * page render to learn something that is almost always the same.
   *
   * Cached once it becomes true. Accounts are disabled rather than deleted, so
   * "some exist" does not go back to "none" in practice.
   */
  let knownToHaveAccounts = false;
  app.get('/local-auth/status', async (_req, res) => {
    if (knownToHaveAccounts) {
      res.status(200).json({ hasAccounts: true });
      return;
    }
    try {
      const result = await callConvex(deps, { action: 'hasAccounts' });
      const hasAccounts = Boolean(result.body?.hasAccounts);
      if (hasAccounts) knownToHaveAccounts = true;
      res.status(200).json({ hasAccounts });
    } catch {
      // Assume accounts exist. Guessing "fresh install" when the database is
      // merely unreachable would offer to create an owner account on a system
      // that already has one.
      res.status(200).json({ hasAccounts: true });
    }
  });

  app.post('/local-auth/sign-out', (_req, res) => {
    clearSessionCookie(res, secureCookie);
    res.status(200).json({ ok: true });
  });

  /**
   * Reset another user's password.
   *
   * The caller's identity comes from the SESSION COOKIE, never from the request
   * body - so "who is asking" is something they proved, not something they
   * claimed. Convex then checks that subject's role in the users table and
   * refuses if it is not an admin.
   *
   * Both halves are needed. Checking the role here would put the authorisation
   * decision in a process that holds the service token, where a bug means
   * anyone who can reach this route can reset anyone's password.
   */
  app.post('/local-auth/admin-reset', async (req, res) => {
    const claims = sessionOf(req);
    if (!claims) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }

    const targetEmail = normalizeEmail(String(req.body?.targetEmail || ''));
    const newPassword = String(req.body?.newPassword || '');
    if (!targetEmail) {
      res.status(400).json({ error: 'Enter the email address of the account to reset.' });
      return;
    }

    const policy = validatePassword(newPassword);
    if (!policy.ok) {
      res.status(400).json({ error: policy.message });
      return;
    }

    const result = await callConvex(deps, {
      action: 'adminResetPassword',
      callerSubject: claims.sub,
      targetEmail,
      newPassword,
      adminAssertion: adminAssertion(deps.serviceToken, claims.sub),
    });

    if (!result.ok) {
      res.status(503).json({ error: 'Password reset is temporarily unavailable.' });
      return;
    }
    if (!result.body?.ok) {
      // 403 when the caller simply is not an administrator, 400 for anything
      // else - the two mean different things to whoever reads the log.
      const denied = /administrator/i.test(String(result.body?.message || ''));
      res.status(denied ? 403 : 400).json({ error: result.body?.message || 'The reset failed.' });
      return;
    }
    res.status(200).json({ ok: true });
  });

  app.post('/local-auth/change-password', async (req, res) => {
    const claims = sessionOf(req);
    if (!claims) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }

    const result = await callConvex(deps, {
      action: 'changePassword',
      subject: claims.sub,
      currentPassword: String(req.body?.currentPassword || ''),
      newPassword: String(req.body?.newPassword || ''),
    });

    if (!result.ok) {
      res.status(503).json({ error: 'Password change is temporarily unavailable.' });
      return;
    }
    if (!result.body?.ok) {
      res.status(400).json({ error: result.body?.message || 'The password could not be changed.' });
      return;
    }
    res.status(200).json({ ok: true });
  });
}

export const _internals = { readCookie, COOKIE_NAME };
