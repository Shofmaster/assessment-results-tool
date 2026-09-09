/**
 * Same-origin reverse proxy for a customer's internal manual server.
 *
 * WHY THIS EXISTS
 * src/services/httpServerSource.ts fetches manuals straight from the browser to
 * a customer file server. In the hosted product that path is throttled by three
 * browser rules the customer cannot always fix:
 *   1. CORS      — their DMS must whitelist our public origin.
 *   2. Mixed content — an https app cannot fetch a plain-http internal server.
 *   3. Private Network Access — Chrome increasingly blocks public origins from
 *      reaching private IP space, and that restriction is tightening.
 * Serving the app from inside the network and proxying the file server under
 * the app's own origin removes all three at once: the browser sees a
 * same-origin https request, and the plain-http hop happens server-side.
 *
 * SECURITY POSTURE
 * This endpoint reaches into the customer's internal network, so it is built as
 * a narrow read-only window rather than a proxy:
 *   - Off unless DOC_SERVER_UPSTREAM is configured.
 *   - Authenticated with the same guard as the AI endpoints. An unauthenticated
 *     version would be an open relay into the internal network.
 *   - Upstream host is pinned by config. The request path never selects a host.
 *   - GET/HEAD only, and traversal outside the upstream base is rejected.
 */
import type { Express, Request, Response } from 'express';
import { verifyRequestAuth } from '../../../api/_lib/auth.js';

/** Response headers worth forwarding. Everything else is dropped rather than
 *  leaking upstream server details (Server:, X-Powered-By:, internal cookies). */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'last-modified',
  'etag',
];

/**
 * Resolve a request path against the upstream base, refusing anything that
 * escapes it. Percent-encoded traversal (`%2e%2e%2f`) is handled because the
 * URL constructor decodes before we compare the resolved prefix.
 */
export function resolveUpstreamUrl(upstreamBase: string, requestPath: string): URL | null {
  let base: URL;
  try {
    base = new URL(upstreamBase.endsWith('/') ? upstreamBase : `${upstreamBase}/`);
  } catch {
    // Misconfigured DOC_SERVER_UPSTREAM. requireConfig() rejects this at boot,
    // but a request must never be able to throw its way out of the resolver.
    return null;
  }

  // Refuse authority-bearing paths outright rather than normalizing them.
  // Stripping the leading slashes would keep the host pinned and be safe, but
  // it silently rewrites "//169.254.169.254/latest/meta-data" into a lookup
  // under the manuals root. Refusing keeps intent legible to the next person
  // auditing this boundary, and nothing legitimate starts with // or /\.
  if (/^\/{2,}/.test(requestPath) || /^\/+\\/.test(requestPath)) return null;

  const relative = requestPath.replace(/^\/+/, '');

  let resolved: URL;
  try {
    resolved = new URL(relative, base);
  } catch {
    return null;
  }

  // Pin the host: no request path may select a different origin.
  if (resolved.origin !== base.origin) return null;
  // Pin the subtree. base.pathname always carries a trailing slash here, so a
  // sibling like "/docs-internal" cannot satisfy a prefix match on "/docs".
  if (!resolved.pathname.startsWith(base.pathname)) return null;

  return resolved;
}

export function mountDocServerProxy(app: Express): void {
  const upstream = (process.env.DOC_SERVER_UPSTREAM || '').trim();
  if (!upstream) return;

  app.all('/docsrv/*splat', async (req: Request, res: Response) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Same guard as the AI endpoints, including the account-approval check.
    const auth = await verifyRequestAuth(req);
    if (!auth.ok) {
      res.status(auth.status ?? 401).send(auth.message ?? 'Unauthorized');
      return;
    }

    const target = resolveUpstreamUrl(upstream, req.path.slice('/docsrv'.length));
    if (!target) {
      res.status(400).send('Invalid document path');
      return;
    }

    // Bound the upstream read so a hung file server cannot pin a worker open.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30_000);

    try {
      const upstreamRes = await fetch(target, {
        method: req.method,
        signal: abort.signal,
        // No credential forwarding: the caller's app session must not be
        // replayed against the file server. Upstream auth, if any, belongs in
        // the file server's own network ACL or a future per-source credential.
        headers: req.headers.range ? { range: String(req.headers.range) } : {},
        redirect: 'manual',
      });

      if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
        // A redirect could point anywhere, including outside the pinned origin.
        res.status(502).send('Document server returned an unsupported redirect');
        return;
      }

      for (const header of FORWARDED_RESPONSE_HEADERS) {
        const value = upstreamRes.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      // Manuals are customer-controlled content served from our origin. Force a
      // download rather than letting the browser render an uploaded HTML or SVG
      // file as same-origin script.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!upstreamRes.headers.get('content-disposition')) {
        res.setHeader('Content-Disposition', 'attachment');
      }
      res.setHeader('Cache-Control', 'private, no-store');

      res.status(upstreamRes.status);

      if (req.method === 'HEAD' || !upstreamRes.body) {
        res.end();
        return;
      }

      // Stream rather than buffer: manuals routinely run to hundreds of MB and
      // buffering one would blow the container's memory limit.
      const reader = upstreamRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      console.error('[docsrv] upstream fetch failed:', err);
      if (!res.headersSent) {
        res
          .status(aborted ? 504 : 502)
          .send(
            aborted
              ? 'Document server did not respond in time.'
              : 'Could not reach the document server. Check DOC_SERVER_UPSTREAM and network reachability.',
          );
      } else {
        res.end();
      }
    } finally {
      clearTimeout(timeout);
    }
  });
}
