/**
 * Minimal fixed-window rate limiter, in-memory, so the window is per warm
 * serverless instance — not a hard guarantee, but enough to blunt scraping
 * bots, accidental hammering, and runaway AI spend without adding a KV store.
 *
 * Two entry points:
 *  - applyRateLimit(req, res, n): per-IP, for the unauthenticated public
 *    endpoints (/api/ecfr, /api/faa-nnumber, /api/due-ical).
 *  - applyRateLimitForKey(key, res, n): per arbitrary key, used to throttle the
 *    authenticated AI endpoints (/api/claude, /api/chat) per Clerk user so a
 *    single approved account can't drain the Anthropic balance with rapid-fire
 *    requests before Anthropic's own upstream limits bite.
 *
 * NOTE: because the window lives in process memory, the limit is enforced per
 * warm Vercel instance, not globally across the fleet. It blunts abuse but is
 * not a hard cap; move to a durable store (Vercel KV / Upstash / Convex
 * counter) if abuse is observed in production.
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
 * Core fixed-window check against an explicit key. Returns true (and sends a
 * 429 with Retry-After) when the key is over the limit for the current window.
 *
 * Usage at the top of a handler, after auth:
 *   if (applyRateLimitForKey(`user:${auth.userId}`, res, 15)) return;
 */
export function applyRateLimitForKey(key: string, res: any, maxPerMinute: number): boolean {
  const now = Date.now();

  let entry = windows.get(key);
  if (!entry || now - entry.windowStartMs >= WINDOW_MS) {
    if (!entry && windows.size >= MAX_TRACKED_IPS) {
      windows.clear();
    }
    entry = { count: 0, windowStartMs: now };
    windows.set(key, entry);
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

/**
 * Per-IP convenience wrapper for the unauthenticated public endpoints.
 * Usage at the top of a handler:
 *   if (applyRateLimit(req, res, 30)) return;
 */
export function applyRateLimit(req: any, res: any, maxPerMinute: number): boolean {
  return applyRateLimitForKey(`ip:${clientIp(req)}`, res, maxPerMinute);
}
