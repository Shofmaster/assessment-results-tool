/**
 * Routes outbound vendor API traffic through a corporate egress proxy.
 *
 * WHY THIS MODULE EXISTS
 * Setting HTTPS_PROXY in the environment does nothing on its own. Node's
 * built-in `fetch` is undici-based and ignores the proxy environment variables,
 * and the Anthropic and OpenAI SDKs both use `fetch`. An install that set
 * AI_HTTPS_PROXY and assumed traffic was being inspected would have been
 * connecting to the vendors directly — a silent failure of a control the
 * operator believed was in place.
 *
 * `EnvHttpProxyAgent` reads HTTP_PROXY / HTTPS_PROXY / NO_PROXY the way curl
 * does. NO_PROXY matters as much as the proxy itself here: without it the
 * global dispatcher would also route this container's calls to `convex` and
 * `postgres` through the corporate proxy, which cannot resolve them.
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

export interface EgressProxyResult {
  enabled: boolean;
  proxyUrl?: string;
  noProxy?: string;
}

/**
 * Installs the proxy dispatcher when a proxy is configured. Safe to call when
 * none is set — it becomes a no-op rather than installing a pass-through agent,
 * so the default path keeps Node's stock dispatcher.
 */
export function configureEgressProxy(): EgressProxyResult {
  const proxyUrl = (process.env.HTTPS_PROXY || process.env.https_proxy || '').trim();

  if (!proxyUrl) {
    return { enabled: false };
  }

  // Fail loudly on a malformed value. Silently ignoring it would reproduce
  // exactly the false sense of security this module exists to prevent.
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol "${parsed.protocol}"`);
    }
  } catch (err) {
    throw new Error(
      `AI_HTTPS_PROXY / HTTPS_PROXY is not a usable proxy URL ("${proxyUrl}"): ${
        err instanceof Error ? err.message : String(err)
      }. Use the form http://proxy.example.internal:3128`,
    );
  }

  setGlobalDispatcher(new EnvHttpProxyAgent());

  return {
    enabled: true,
    proxyUrl,
    noProxy: (process.env.NO_PROXY || process.env.no_proxy || '').trim() || undefined,
  };
}

/** Redacts any credentials embedded in a proxy URL before it reaches a log. */
export function redactProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    if (url.username || url.password) {
      url.username = '***';
      url.password = '';
    }
    return url.toString();
  } catch {
    return '(unparseable)';
  }
}
