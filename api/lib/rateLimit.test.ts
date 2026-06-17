import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyRateLimitForKey, applyRateLimit } from './rateLimit.js';

/** Minimal res stub capturing status/headers/body for assertions. */
function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('applyRateLimitForKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit, then blocks with 429 + Retry-After', () => {
    const key = `user:test-${Math.random()}`;
    const max = 3;
    // First `max` calls are allowed.
    for (let i = 0; i < max; i++) {
      const res = makeRes();
      expect(applyRateLimitForKey(key, res, max)).toBe(false);
      expect(res.statusCode).toBe(200);
    }
    // The next call exceeds the window.
    const blocked = makeRes();
    expect(applyRateLimitForKey(key, blocked, max)).toBe(true);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeDefined();
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('resets after the 60s window elapses', () => {
    const key = `user:reset-${Math.random()}`;
    const max = 1;
    expect(applyRateLimitForKey(key, makeRes(), max)).toBe(false);
    expect(applyRateLimitForKey(key, makeRes(), max)).toBe(true);
    // Advance past the window.
    vi.advanceTimersByTime(60_001);
    expect(applyRateLimitForKey(key, makeRes(), max)).toBe(false);
  });

  it('tracks separate keys independently', () => {
    const a = `user:a-${Math.random()}`;
    const b = `user:b-${Math.random()}`;
    expect(applyRateLimitForKey(a, makeRes(), 1)).toBe(false);
    expect(applyRateLimitForKey(a, makeRes(), 1)).toBe(true);
    // Different key is unaffected.
    expect(applyRateLimitForKey(b, makeRes(), 1)).toBe(false);
  });
});

describe('applyRateLimit (per-IP wrapper)', () => {
  it('derives the key from x-forwarded-for and blocks over the limit', () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 254)}`;
    const req = { headers: { 'x-forwarded-for': ip } };
    expect(applyRateLimit(req, makeRes(), 1)).toBe(false);
    const blocked = makeRes();
    expect(applyRateLimit(req, blocked, 1)).toBe(true);
    expect(blocked.statusCode).toBe(429);
  });
});
