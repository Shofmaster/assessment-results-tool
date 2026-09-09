/**
 * CORS guard for the authenticated AI proxy endpoints (/api/claude, /api/chat).
 *
 * Without this, Vercel's default response lets any web origin POST to the proxy
 * as long as it presents a valid Clerk token — so a token captured from another
 * site could be replayed cross-origin. Pinning Access-Control-Allow-Origin to
 * the app's own origins is defense-in-depth behind the bearer-token check.
 *
 * The allowlist is the production domain plus local dev origins, and can be
 * extended via the ALLOWED_ORIGINS env var (comma-separated) for preview
 * deployments or additional domains. Requests with no Origin header are
 * same-origin (or non-browser) and need no CORS headers.
 *
 * SELF-HOSTED INSTALLS: setting APP_ORIGIN switches this to a closed allowlist
 * of exactly {APP_ORIGIN} + ALLOWED_ORIGINS, dropping the hosted defaults. An
 * on-prem deployment that still trusted our vendor domain would let
 * aerogaptechnologies.com script a customer's internal install cross-origin —
 * a finding any customer security review would (correctly) raise. Hosted
 * deployments leave APP_ORIGIN unset and keep the defaults below.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.aerogaptechnologies.com',
  'https://aerogaptechnologies.com',
  'https://localhost:5173',
  'http://localhost:5173',
];

function parseOriginList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);
}

export function allowedOrigins(): Set<string> {
  const extra = parseOriginList(process.env.ALLOWED_ORIGINS);
  const appOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');

  // Self-hosted: the install's own origin is the whole trust boundary.
  if (appOrigin) {
    return new Set([appOrigin, ...extra]);
  }

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

/**
 * Applies CORS headers for an allowed origin and answers preflight requests.
 * Returns true when the request was a preflight (OPTIONS) that has been fully
 * handled — the caller should `return` immediately in that case.
 */
export function applyCors(req: any, res: any): boolean {
  const origin: string | undefined = req?.headers?.origin;

  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    // X-AeroGap-Project-Id is the untrusted project hint the SPA attaches so the
    // server can bill the owning company. Omitting it here would make the
    // browser block every cross-origin AI request at preflight.
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-AeroGap-Project-Id',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req?.method === 'OPTIONS') {
    // Preflight: 204 with the headers already set above. If the origin wasn't
    // allowed, the absent Access-Control-Allow-Origin makes the browser block.
    res.status(204).end();
    return true;
  }

  return false;
}
