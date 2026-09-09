/**
 * Verifying a HOSTED (Clerk) identity on a desktop install, without internet.
 *
 * WHY THIS EXISTS
 * Clerk's tokens live about a minute and are refreshed by Clerk's script, which
 * needs the internet. A desktop user who signed in with their AeroGap account
 * would therefore be signed out within a minute of losing the connection. So
 * the app server exchanges a fresh Clerk token, once, for its OWN 30-day
 * session (POST /local-auth/hosted-session) - the same session a local account
 * gets, for the same subject. After that the page can run on local tokens,
 * offline, as the same user.
 *
 * WHAT IT VERIFIES WITH
 * The tenant's public JWT verification key (`CLERK_JWT_KEY`), baked into the
 * build. Public key material: it proves a token was signed by our Clerk tenant
 * and cannot mint one. No secret key is involved and no network call is made -
 * this is the same networkless verification api/_lib/auth.ts already does for
 * every API request.
 *
 * Pure enough to test with a locally generated key pair.
 */
import { verifyToken } from '@clerk/backend';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
import { HOSTED_SUBJECT_PREFIX } from './localAuth.js';

export interface HostedClaims {
  subject: string;
  email?: string;
  name?: string;
}

export interface HostedIdentity {
  /** Verify a Clerk token offline. Null when it is not a valid token from our tenant. */
  verify: (token: string) => Promise<HostedClaims | null>;
  /**
   * The person's profile as the LOCAL database already knows it, read with
   * their own token. The row was written from Clerk's verified user object
   * during the online sign-in, so it is the trustworthy source of email and
   * name - not the request body, which anyone can type.
   */
  profile: (token: string) => Promise<{ email?: string; name?: string } | null>;
}

function readVerified(result: unknown): HostedClaims | null {
  const payload = (result as { errors?: unknown; data?: Record<string, unknown> } | Record<string, unknown>) ?? {};
  if ((payload as { errors?: unknown }).errors) return null;
  const claims = ((payload as { data?: Record<string, unknown> }).data ?? payload) as Record<string, unknown>;
  const sub = claims.sub;
  if (typeof sub !== 'string' || !sub.startsWith(HOSTED_SUBJECT_PREFIX)) return null;
  const email = typeof claims.email === 'string' && claims.email.trim() ? claims.email.trim() : undefined;
  const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : undefined;
  return { subject: sub, email, name };
}

/**
 * @param options.jwtKey     CLERK_JWT_KEY - the PEM public key. Required.
 * @param options.audience   the Convex JWT template audience, default "convex"
 * @param options.convexUrl  the LOCAL Convex deployment, for profile()
 */
export function createHostedIdentity(options: {
  jwtKey: string;
  audience?: string;
  convexUrl: string;
}): HostedIdentity {
  const jwtKey = options.jwtKey.trim();
  const audience = (options.audience || 'convex').trim();

  return {
    async verify(token) {
      if (!jwtKey || typeof token !== 'string' || token.split('.').length !== 3) return null;
      // The Convex template first - it is the token the SPA holds - then the
      // plain session token, mirroring api/_lib/auth.ts so both tiers agree.
      for (const opts of [{ audience }, {}]) {
        try {
          const result = await verifyToken(token, { jwtKey, clockSkewInMs: 10_000, ...opts });
          const claims = readVerified(result);
          if (claims) return claims;
        } catch {
          // Try the next shape; a failure of both is simply "not ours".
        }
      }
      return null;
    },

    async profile(token) {
      if (!options.convexUrl) return null;
      try {
        const client = new ConvexHttpClient(options.convexUrl);
        client.setAuth(token);
        const row = (await client.query(api.users.getCurrent, {})) as
          | { email?: string; name?: string }
          | null;
        if (!row) return null;
        return {
          email: typeof row.email === 'string' && row.email ? row.email : undefined,
          name: typeof row.name === 'string' && row.name ? row.name : undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
