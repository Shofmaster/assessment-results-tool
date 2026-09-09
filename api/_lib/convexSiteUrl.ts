/**
 * Where Convex serves HTTP actions (the "site" origin), as seen from the api/
 * runtime.
 *
 * Convex Cloud serves functions on <name>.convex.cloud and HTTP actions on
 * <name>.convex.site. Self-hosted installs run both on the same host at
 * different ports, and the value that matters there is the LOOPBACK one, not
 * the public one: the public port is fronted by Caddy with TLS (often a
 * self-signed internal CA), so going through it from the same machine adds a
 * trust problem for no benefit. That is what CONVEX_SITE_INTERNAL_URL is for.
 *
 * Do not confuse the two port families on self-host. The backend binds
 * loopback-only internal ports (13210 / 13211); 3210 / 3211 belong to the proxy.
 * Pointing at a public port here reproduces the CONVEX_URL bug that made every
 * AI request fail with a 503 approval-check error.
 */

function clean(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

export function resolveConvexSiteUrl(): string | null {
  // 1. Explicit internal override. Self-host writes this; it bypasses the proxy.
  const internal = clean(process.env.CONVEX_SITE_INTERNAL_URL);
  if (internal) return internal;

  // 2. Explicit site URL (set this in Vercel even though 3 would work).
  const site = clean(process.env.CONVEX_SITE_URL);
  if (site) return site;

  // 3. Derive from the functions origin. Only valid for Convex Cloud, whose two
  //    origins differ by TLD; a self-hosted CONVEX_URL is a host:port and has no
  //    derivable site origin, so this correctly yields null there.
  const convexUrl = clean(process.env.CONVEX_URL) || clean(process.env.VITE_CONVEX_URL);
  if (convexUrl.includes('.convex.cloud')) {
    return convexUrl.replace('.convex.cloud', '.convex.site');
  }

  return null;
}
