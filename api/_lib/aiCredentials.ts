/**
 * Resolves which AI provider key an api/ request should spend, for both the
 * Vercel functions and the self-hosted Express adapter that mounts them.
 *
 * The stored key lives in Convex, which this runtime cannot read directly:
 * ConvexHttpClient only calls PUBLIC functions, and a public function that
 * returned a plaintext key would be readable by any signed-in browser holding
 * the same Clerk token. So the lookup goes through the service-token-gated HTTP
 * route in convex/http.ts, which requires BOTH that token and the caller's Clerk
 * identity.
 *
 * Precedence: company row -> install row -> this runtime's own env var.
 * The env rung is permanent, not a migration shim - it is what keeps a
 * deployment with no rows behaving exactly as it did before BYOK existed.
 */
import { resolveConvexSiteUrl } from './convexSiteUrl.js';
import {
  credentialCacheKey,
  getCachedCredential,
  invalidateCachedCredential,
  setCachedCredential,
  type CachedCredential,
} from './aiCredentialCache.js';
import {
  PROVIDER_ENV_VAR,
  type AiProvider,
  type CredentialSource,
} from '../../convex/lib/aiCredentialScope.js';
import {
  SERVICE_TOKEN_ENV,
  SERVICE_TOKEN_HEADER,
} from '../../convex/lib/serviceToken.js';

export type { AiProvider };

/** Carries an HTTP status so handlers can surface it without remapping. */
export class AiCredentialError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiCredentialError';
    this.status = status;
  }
}

export interface ResolveContext {
  /** The caller's Clerk JWT, forwarded as the user leg of the route's auth. */
  clerkToken: string;
  userId: string;
  /** Untrusted hint from the X-AeroGap-Project-Id header. Re-authorized in Convex. */
  projectId?: string;
}

export interface ResolvedApiKey {
  apiKey: string;
  source: CredentialSource;
  companyId?: string;
  /** Pass to invalidateAiKey() when the provider rejects this key. */
  cacheKey: string;
}

const LOOKUP_TIMEOUT_MS = 5_000;

function envKeyFor(provider: AiProvider): string {
  return (process.env[PROVIDER_ENV_VAR[provider]] || '').trim();
}

async function lookupInConvex(
  provider: AiProvider,
  ctx: ResolveContext,
): Promise<CachedCredential | null> {
  const serviceToken = (process.env[SERVICE_TOKEN_ENV] || '').trim();
  if (!serviceToken) {
    // Deliberately NOT falling back to the env key. Env is the fallback for
    // "no row exists", never for "the lookup is broken" - silently routing
    // every tenant's spend onto the platform key is worse than an outage.
    throw new AiCredentialError(
      `AI credential lookup is not configured: ${SERVICE_TOKEN_ENV} is not set.`,
      503,
    );
  }

  const siteUrl = resolveConvexSiteUrl();
  if (!siteUrl) {
    throw new AiCredentialError(
      'AI credential lookup is not configured: no Convex site URL. Set CONVEX_SITE_URL (cloud) or CONVEX_SITE_INTERNAL_URL (self-host).',
      503,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${siteUrl}/internal/ai-credential`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // The token rides in a HEADER, never a URL or a body: query strings end
        // up in access logs, and bodies end up in function-call history.
        [SERVICE_TOKEN_HEADER]: serviceToken,
        Authorization: `Bearer ${ctx.clerkToken}`,
      },
      body: JSON.stringify({ provider, projectId: ctx.projectId }),
    });
  } catch (err: unknown) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    throw new AiCredentialError(
      aborted
        ? 'AI credential lookup timed out.'
        : 'AI credential lookup failed to reach Convex.',
      503,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Never echo the body: it is from our own service, but this path is one
    // refactor away from carrying key material.
    throw new AiCredentialError(
      `AI credential lookup rejected (HTTP ${response.status}).`,
      response.status === 401 || response.status === 403 ? 500 : 503,
    );
  }

  const payload = (await response.json()) as {
    credential?: { apiKey?: string; source?: string; companyId?: string | null } | null;
  };
  const credential = payload?.credential;
  if (!credential || typeof credential.apiKey !== 'string' || credential.apiKey.length === 0) {
    return null;
  }

  return {
    apiKey: credential.apiKey,
    source: credential.source === 'company' ? 'company' : 'install',
    companyId: credential.companyId || undefined,
  };
}

/**
 * Resolve the key for one request. Cached briefly per (provider, user, project).
 */
export async function resolveAiKey(
  provider: AiProvider,
  ctx: ResolveContext,
): Promise<ResolvedApiKey> {
  const cacheKey = credentialCacheKey(provider, ctx.userId, ctx.projectId);

  const cached = getCachedCredential(cacheKey);
  if (cached.hit) {
    if (cached.value) {
      return { ...cached.value, cacheKey };
    }
    const fromEnv = envKeyFor(provider);
    if (fromEnv) return { apiKey: fromEnv, source: 'env', cacheKey };
    throw missingKeyError(provider);
  }

  const found = await lookupInConvex(provider, ctx);
  setCachedCredential(cacheKey, found);

  if (found) return { ...found, cacheKey };

  const fromEnv = envKeyFor(provider);
  if (fromEnv) return { apiKey: fromEnv, source: 'env', cacheKey };
  throw missingKeyError(provider);
}

function missingKeyError(provider: AiProvider): AiCredentialError {
  return new AiCredentialError(
    `No ${provider} API key is configured. A company admin can add one in Settings → AI Keys.`,
    503,
  );
}

/**
 * Forget a key the provider just rejected, so the next attempt re-reads it.
 * Pair with exactly one retry - see the cache module's note on rotation.
 */
export function invalidateAiKey(cacheKey: string): void {
  invalidateCachedCredential(cacheKey);
}

/** True when a provider error means "this key is no good" rather than "try later". */
export function isAuthRejection(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/** Providers attach `status` in one of two shapes; dig it out of either. */
export function providerErrorStatus(error: any): number | undefined {
  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.response?.status === 'number') return error.response.status;
  return undefined;
}

/**
 * Resolve a key, run `work` with it, and if the provider rejects the key as
 * invalid, forget the cached copy and try exactly once more.
 *
 * That single retry is what makes key rotation a non-event: without it, every
 * request in the cache TTL window after a rotation fails. Retrying more than
 * once would just hammer a genuinely bad key, so a second rejection propagates.
 *
 * Not used by /api/claude's streaming path, which needs to know whether any
 * bytes have been written before it can safely retry.
 */
export async function withResolvedKey<T>(
  provider: AiProvider,
  ctx: ResolveContext,
  work: (apiKey: string) => Promise<T>,
): Promise<T> {
  const resolved = await resolveAiKey(provider, ctx);
  try {
    return await work(resolved.apiKey);
  } catch (err: unknown) {
    if (!isAuthRejection(providerErrorStatus(err))) throw err;
    invalidateAiKey(resolved.cacheKey);
    const retry = await resolveAiKey(provider, ctx);
    return await work(retry.apiKey);
  }
}

/** The untrusted project hint header the browser attaches. */
export const PROJECT_HINT_HEADER = 'x-aerogap-project-id';

export function projectHintFromRequest(req: any): string | undefined {
  const raw = req?.headers?.[PROJECT_HINT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
