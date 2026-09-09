/**
 * Fixed-window rate limiter for the self-hosted Express server.
 *
 * Mirrors api/_lib/rateLimit.ts so local-auth endpoints can throttle brute-force
 * attempts without pulling Vercel-specific assumptions into the app server.
 */
import type { Request, Response } from 'express';

interface WindowEntry {
  count: number;
  windowStartMs: number;
}

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, WindowEntry>();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function applyRateLimitForKey(key: string, res: Response, maxPerMinute: number): boolean {
  const now = Date.now();

  let entry = windows.get(key);
  if (!entry || now - entry.windowStartMs >= WINDOW_MS) {
    if (!entry && windows.size >= MAX_TRACKED_KEYS) {
      windows.clear();
    }
    entry = { count: 0, windowStartMs: now };
    windows.set(key, entry);
  }

  entry.count += 1;
  if (entry.count > maxPerMinute) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.windowStartMs + WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'Too many attempts — please wait a minute and try again.' });
    return true;
  }
  return false;
}

export function applyRateLimit(req: Request, res: Response, maxPerMinute: number): boolean {
  return applyRateLimitForKey(`ip:${clientIp(req)}`, res, maxPerMinute);
}

/** Test-only hook to avoid cross-test pollution from the in-memory limiter. */
export function resetRateLimitsForTests(): void {
  windows.clear();
}
