/**
 * Minimal per-IP fixed-window rate limiter for the unauthenticated public
 * endpoints (/api/ecfr, /api/faa-nnumber, /api/due-ical). In-memory, so the
 * window is per warm serverless instance — not a hard guarantee, but enough
 * to blunt scraping bots and accidental hammering without adding a KV store.
 * Authenticated endpoints are already gated by Clerk and don't need this.
 */

interface WindowEntry {
  count: number;
  windowStartMs: number;
}

const WINDOW_MS = 60_000;
/** Cap the map size so a spoofed-IP flood can't grow memory unbounded. */
const MAX_TRACKED_IPS = 10_000;

const windows = new Map<string, WindowEntry>();

function clientIp(req: any): string {
  const fwd = req?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    // Vercel sets this; the first hop is the client.
    return fwd.split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || 'unknown';
}

/**
 * Returns true (and sends a 429) when the caller is over the limit.
 * Usage at the top of a handler:
 *   if (applyRateLimit(req, res, 30)) return;
 */
export function applyRateLimit(req: any, res: any, maxPerMinute: number): boolean {
  const now = Date.now();
  const ip = clientIp(req);

  let entry = windows.get(ip);
  if (!entry || now - entry.windowStartMs >= WINDOW_MS) {
    if (!entry && windows.size >= MAX_TRACKED_IPS) {
      windows.clear();
    }
    entry = { count: 0, windowStartMs: now };
    windows.set(ip, entry);
  }

  entry.count += 1;
  if (entry.count > maxPerMinute) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.windowStartMs + WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).send('Too many requests — please slow down.');
    return true;
  }
  return false;
}
