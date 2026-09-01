import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _CACHE_LIMITS,
  _resetCredentialCache,
  credentialCacheKey,
  getCachedCredential,
  invalidateCachedCredential,
  setCachedCredential,
} from './aiCredentialCache.js';

/**
 * The TTLs here are the ONLY bound on how long a rotated key keeps being used
 * on a self-hosted install, whose Express process runs for weeks without the
 * recycling that quietly saves Vercel. So they are pinned, not just exercised.
 */
describe('credentialCacheKey', () => {
  it('separates providers, users and projects', () => {
    const keys = new Set([
      credentialCacheKey('anthropic', 'user_1'),
      credentialCacheKey('voyage', 'user_1'),
      credentialCacheKey('anthropic', 'user_2'),
      credentialCacheKey('anthropic', 'user_1', 'proj_1'),
    ]);
    expect(keys.size).toBe(4);
  });

  it('treats a missing project the same way every time', () => {
    expect(credentialCacheKey('anthropic', 'u')).toBe(credentialCacheKey('anthropic', 'u', undefined));
  });
});

describe('credential cache', () => {
  beforeEach(() => {
    _resetCredentialCache();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const value = { apiKey: 'sk-ant-secret', source: 'company' as const, companyId: 'c1' };

  it('returns a stored value within the TTL', () => {
    setCachedCredential('k', value);
    vi.advanceTimersByTime(_CACHE_LIMITS.HIT_TTL_MS - 1);
    expect(getCachedCredential('k')).toEqual({ hit: true, value });
  });

  it('expires a stored value at the TTL', () => {
    setCachedCredential('k', value);
    vi.advanceTimersByTime(_CACHE_LIMITS.HIT_TTL_MS);
    expect(getCachedCredential('k')).toEqual({ hit: false, value: null });
  });

  it('caches a negative result, so a miss does not re-query every request', () => {
    setCachedCredential('k', null);
    expect(getCachedCredential('k')).toEqual({ hit: true, value: null });
  });

  it('expires negative results sooner than hits', () => {
    // The moment after an admin pastes their first key is exactly when a stale
    // "nothing configured" answer is most annoying.
    expect(_CACHE_LIMITS.MISS_TTL_MS).toBeLessThan(_CACHE_LIMITS.HIT_TTL_MS);
    setCachedCredential('k', null);
    vi.advanceTimersByTime(_CACHE_LIMITS.MISS_TTL_MS);
    expect(getCachedCredential('k').hit).toBe(false);
  });

  it('forgets a key on demand, which is what makes rotation recoverable', () => {
    setCachedCredential('k', value);
    invalidateCachedCredential('k');
    expect(getCachedCredential('k')).toEqual({ hit: false, value: null });
  });

  it('reports a miss for a key it has never seen', () => {
    expect(getCachedCredential('never')).toEqual({ hit: false, value: null });
  });

  it('stays bounded under sustained inserts', () => {
    // One long-lived self-host process must not grow without limit.
    for (let i = 0; i < 2000; i += 1) {
      setCachedCredential(`k${i}`, value);
    }
    let present = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (getCachedCredential(`k${i}`).hit) present += 1;
    }
    expect(present).toBeLessThanOrEqual(_CACHE_LIMITS.MAX_ENTRIES);
    expect(present).toBeGreaterThan(0);
  });

  it('evicts oldest-first, so the newest entries survive', () => {
    for (let i = 0; i < _CACHE_LIMITS.MAX_ENTRIES + 10; i += 1) {
      setCachedCredential(`k${i}`, value);
    }
    expect(getCachedCredential('k0').hit).toBe(false);
    expect(getCachedCredential(`k${_CACHE_LIMITS.MAX_ENTRIES + 9}`).hit).toBe(true);
  });

  it('refreshes the TTL when a key is written again', () => {
    setCachedCredential('k', value);
    vi.advanceTimersByTime(_CACHE_LIMITS.HIT_TTL_MS - 10);
    setCachedCredential('k', value);
    vi.advanceTimersByTime(20);
    expect(getCachedCredential('k').hit).toBe(true);
  });
});
