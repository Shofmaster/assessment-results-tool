/**
 * Shared auth guard for the public Vercel serverless endpoints that spend the
 * server-side ANTHROPIC_API_KEY. Without this, /api/claude and /api/chat are
 * open proxies that let anyone drain the Anthropic balance.
 *
 * Verifies a Clerk JWT passed as `Authorization: Bearer <token>`.
 * The client sends the same "convex" template JWT used for Convex auth.
 * Fails CLOSED on every leg: if no verification credential or CONVEX_URL is
 * configured, or the Convex approval-status check cannot complete, the
 * request is rejected rather than silently bypassing auth.
 *
 * TWO WAYS TO VERIFY, and the choice matters for what we ship.
 *   CLERK_JWT_KEY    the instance's JWT verification PEM. PUBLIC key material,
 *                    verified networklessly. Preferred, and the only one a
 *                    distributed desktop build can carry - a secret key sitting
 *                    in every customer's install directory would be a
 *                    single-file compromise of the whole Clerk tenant, and it
 *                    could not be rotated without re-shipping the installer.
 *   CLERK_SECRET_KEY the hosted Vercel deployment's existing credential.
 * Whichever is present is used; JWT key wins when both are.
 *
 * The approval verdict is cached in process for a few seconds (see
 * api/_lib/approvalCache.ts) so the hot path does not re-read an almost-never
 * changing field on every request. That cache holds only answers Convex
 * actually gave; a failed check is never cached, so the fail-closed behaviour
 * above is per request.
 */
import { verifyToken } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import { getCachedApproval, setCachedApproval } from './approvalCache.js';

export interface AuthResult {
  ok: boolean;
  userId?: string;
  /**
   * The verified bearer token, echoed back so callers can forward it as the
   * user leg of the Convex credential lookup (api/_lib/aiCredentials.ts).
   * Present only when ok === true.
   */
  token?: string;
  /** HTTP status to return when ok === false. */
  status?: number;
  message?: string;
}

function extractBearer(req: any): string | null {
  const header: string | undefined =
    req?.headers?.authorization || req?.headers?.Authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function clerkAudience(): string {
  return (process.env.CLERK_JWT_AUDIENCE || 'convex').trim();
}

/**
 * Read the `sub` (Clerk user id) from a verifyToken result.
 * @clerk/backend v2+ returns the JwtPayload directly; older versions used { data, errors }.
 */
function subFromVerifyResult(result: any): string | null {
  if (result?.errors) return null;
  const sub = result?.sub ?? result?.data?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/**
 * Credential used to verify a token signature.
 * `jwtKey` is the public PEM (networkless); `secretKey` reaches Clerk's JWKS.
 */
type VerifyCredential = { jwtKey: string } | { secretKey: string };

/**
 * Which credential this runtime has, or null when it has neither.
 *
 * Exported for the boot-time check in selfhost; a deployment that reaches a
 * request with neither is already broken and should say so at startup.
 */
export function clerkVerifyCredential(): VerifyCredential | null {
  const jwtKey = process.env.CLERK_JWT_KEY?.trim();
  if (jwtKey) return { jwtKey };
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (secretKey) return { secretKey };
  return null;
}

/** Verify the bearer token and return the Clerk user id, or null on failure. */
async function verifyClerkBearerToken(
  token: string,
  credential: VerifyCredential,
): Promise<string | null> {
  const baseOptions = {
    ...credential,
    clockSkewInMs: 10_000,
  };

  // Prefer the Convex JWT template — same token Convex already trusts.
  try {
    const convexResult = await verifyToken(token, {
      ...baseOptions,
      audience: clerkAudience(),
    });
    const convexSub = subFromVerifyResult(convexResult);
    if (convexSub) return convexSub;
  } catch (convexErr) {
    console.warn('[verifyRequestAuth] convex-template verify threw:', convexErr);
  }

  // Fall back to the default session token (no audience constraint).
  try {
    const sessionResult = await verifyToken(token, baseOptions);
    const sessionSub = subFromVerifyResult(sessionResult);
    if (sessionSub) return sessionSub;
  } catch (sessionErr) {
    console.warn('[verifyRequestAuth] session-token verify threw:', sessionErr);
  }

  console.error('[verifyRequestAuth] Clerk verifyToken failed for both convex and session paths', {
    audience: clerkAudience(),
  });
  return null;
}

/**
 * Verify a token issued by a self-hosted install's own identity provider.
 *
 * Lazily imported so the hosted Vercel runtime never loads it: that deployment
 * has no local issuer and no reason to carry the code.
 *
 * The JWKS is fetched from the app server's own origin - which, in the process
 * that serves it, is loopback. Convex verifies the same token independently
 * against the same keys, so both tiers reach the same verdict from one source
 * of truth rather than two copies of a public key that could drift.
 */
async function verifyLocalBearerToken(token: string): Promise<string | null> {
  const issuer = (process.env.LOCAL_AUTH_ISSUER || '').trim();
  if (!issuer) return null;

  try {
    // Node's built-in crypto and a JWKS fetch, rather than adding a JWT library
    // to the hosted product's dependency tree for a code path it never runs.
    const { createPublicKey, verify: cryptoVerify } = await import('node:crypto');

    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [headerPart, claimsPart, signaturePart] = parts;

    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    // Same rule as the issuer itself: only RS256, never "none" and never an
    // algorithm the header gets to choose.
    if (header?.alg !== 'RS256') return null;

    const jwksUrl = (process.env.LOCAL_AUTH_JWKS_URL || '').trim();
    if (!jwksUrl || jwksUrl === 'unused') return null;

    const response = await fetch(jwksUrl);
    if (!response.ok) return null;
    const jwks = (await response.json()) as { keys?: Array<Record<string, unknown>> };

    const jwk = (jwks.keys || []).find((k) => !header.kid || k.kid === header.kid);
    if (!jwk) return null;

    const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
    const valid = cryptoVerify(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${claimsPart}`),
      publicKey,
      Buffer.from(signaturePart, 'base64url'),
    );
    if (!valid) return null;

    const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== issuer) return null;
    // The Convex audience specifically: a long-lived SESSION cookie must not be
    // usable here just because it was signed by the same key.
    if (claims.aud !== (process.env.CLERK_JWT_AUDIENCE || 'convex')) return null;
    if (typeof claims.exp !== 'number' || claims.exp + 10 < now) return null;
    if (typeof claims.sub !== 'string' || !claims.sub.startsWith('local|')) return null;

    return claims.sub;
  } catch (err) {
    console.warn('[verifyRequestAuth] local token verification threw:', err);
    return null;
  }
}

/**
 * The approval gate, shared by both identity providers.
 *
 * Extracted rather than duplicated: this is the check that stops an account an
 * administrator has not admitted from spending against the AI key, and two
 * copies of it would eventually disagree about who is allowed in.
 *
 * Fails CLOSED on every leg. An unreachable Convex is not a verdict, so nothing
 * is cached on that path and each request during an outage re-checks rather
 * than one error pinning a decision for the cache TTL.
 */
async function checkApproval(userId: string, token: string): Promise<AuthResult> {
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    return {
      ok: false,
      status: 503,
      message:
        'Server approval check is not configured: CONVEX_URL is not set. Add it in Vercel → Project → Settings → Environment Variables.',
    };
  }

  // Consulted only AFTER the CONVEX_URL check, never before it: a runtime not
  // configured to check approvals must reject every request, not coast on
  // verdicts cached while it still was.
  const cachedVerdict = getCachedApproval(userId);
  if (cachedVerdict === 'blocked') {
    return { ok: false, status: 403, message: 'Your account is awaiting approval.' };
  }

  if (cachedVerdict !== 'approved') {
    try {
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(token);
      const dbUser: any = await client.query(api.users.getCurrent, {});
      const status = dbUser?.approvalStatus;
      if (status === 'pending' || status === 'rejected') {
        setCachedApproval(userId, 'blocked');
        return { ok: false, status: 403, message: 'Your account is awaiting approval.' };
      }
      setCachedApproval(userId, 'approved');
    } catch (convexErr) {
      console.error('[verifyRequestAuth] approval check failed (Convex unreachable?)', convexErr);
      return {
        ok: false,
        status: 503,
        message: 'Approval check unavailable — please try again shortly.',
      };
    }
  }

  return { ok: true, userId, token };
}

/** True when this runtime issues its own identities. */
function usingLocalAuth(): boolean {
  return (process.env.AUTH_MODE || 'clerk').trim() === 'local';
}

export async function verifyRequestAuth(req: any): Promise<AuthResult> {
  // A self-hosted install verifies against its own issuer and has no Clerk
  // credential at all, so the Clerk branch below would reject every request.
  if (usingLocalAuth()) {
    const token = extractBearer(req);
    if (!token) {
      return { ok: false, status: 401, message: 'Missing or malformed Authorization header.' };
    }

    const userId = await verifyLocalBearerToken(token);
    if (!userId) {
      return {
        ok: false,
        status: 401,
        message: 'Invalid or expired session. Please sign in again.',
      };
    }

    // The approval gate still applies: it is what stops an account that an
    // administrator has not admitted from spending against the AI key.
    return await checkApproval(userId, token);
  }

  const credential = clerkVerifyCredential();
  if (!credential) {
    // Fail closed: a missing credential must not turn the guard into a no-op.
    return {
      ok: false,
      status: 503,
      message:
        'Server auth is not configured: neither CLERK_JWT_KEY nor CLERK_SECRET_KEY is set. ' +
        'Add one in Vercel → Project → Settings → Environment Variables.',
    };
  }

  const token = extractBearer(req);
  if (!token) {
    return { ok: false, status: 401, message: 'Missing or malformed Authorization header.' };
  }

  try {
    const userId = await verifyClerkBearerToken(token, credential);
    if (!userId) {
      return {
        ok: false,
        status: 401,
        message:
          'Invalid or expired session token. Please refresh the page or sign in again.',
      };
    }

    // Block users who haven't been manually approved yet, so a pending account
    // can't run up Anthropic costs before the admin lets them in.
    return await checkApproval(userId, token);
  } catch (err) {
    console.error('[verifyRequestAuth] Clerk verifyToken threw:', err);
    return {
      ok: false,
      status: 401,
      message:
        'Invalid or expired session token. Please refresh the page or sign in again.',
    };
  }
}
