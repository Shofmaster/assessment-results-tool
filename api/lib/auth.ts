/**
 * Shared auth guard for the public Vercel serverless endpoints that spend the
 * server-side ANTHROPIC_API_KEY. Without this, /api/claude and /api/chat are
 * open proxies that let anyone drain the Anthropic balance.
 *
 * Verifies a Clerk JWT passed as `Authorization: Bearer <token>`.
 * The client sends the same "convex" template JWT used for Convex auth.
 * Fails CLOSED: if CLERK_SECRET_KEY is not configured, every request is
 * rejected rather than silently bypassing auth.
 */
import { verifyToken } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';

export interface AuthResult {
  ok: boolean;
  userId?: string;
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
 * Read the `sub` (Clerk user id) claim from a verifyToken result, if present.
 * Typed as `any` because @clerk/backend's JwtReturnType union resolves
 * inconsistently across build environments (Vercel infers `data` as `{}`).
 */
function subFromResult(result: any): string | null {
  const sub = result?.data?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/** Verify the bearer token and return the Clerk user id, or null on failure. */
async function verifyClerkBearerToken(token: string, secretKey: string): Promise<string | null> {
  const baseOptions = {
    secretKey,
    clockSkewInMs: 10_000,
  };

  // Prefer the Convex JWT template — same token Convex already trusts.
  const convexResult = await verifyToken(token, {
    ...baseOptions,
    audience: clerkAudience(),
  });
  const convexSub = subFromResult(convexResult);
  if (!convexResult.errors && convexSub) {
    return convexSub;
  }

  // Fall back to the default session token for older clients.
  const sessionResult = await verifyToken(token, baseOptions);
  const sessionSub = subFromResult(sessionResult);
  if (!sessionResult.errors && sessionSub) {
    return sessionSub;
  }

  console.error('[verifyRequestAuth] Clerk verifyToken failed:', {
    convexErrors: convexResult.errors,
    sessionErrors: sessionResult.errors,
    audience: clerkAudience(),
  });
  return null;
}

export async function verifyRequestAuth(req: any): Promise<AuthResult> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    // Fail closed: a missing secret must not turn the guard into a no-op.
    return {
      ok: false,
      status: 503,
      message:
        'Server auth is not configured: CLERK_SECRET_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.',
    };
  }

  const token = extractBearer(req);
  if (!token) {
    return { ok: false, status: 401, message: 'Missing or malformed Authorization header.' };
  }

  try {
    const userId = await verifyClerkBearerToken(token, secretKey);
    if (!userId) {
      return {
        ok: false,
        status: 401,
        message:
          'Invalid or expired session token. Please refresh the page or sign in again.',
      };
    }

    // Block users who haven't been manually approved yet, so a pending account
    // can't run up Anthropic costs before the admin lets them in. Fails OPEN only
    // when Convex is unreachable / unconfigured — the valid token is still required.
    const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
    if (convexUrl) {
      try {
        const client = new ConvexHttpClient(convexUrl);
        client.setAuth(token);
        const dbUser: any = await client.query(api.users.getCurrent, {});
        const status = dbUser?.approvalStatus;
        if (status === 'pending' || status === 'rejected') {
          return { ok: false, status: 403, message: 'Your account is awaiting approval.' };
        }
      } catch {
        // Convex unreachable: fall through and allow (token already verified).
      }
    }

    return { ok: true, userId };
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
