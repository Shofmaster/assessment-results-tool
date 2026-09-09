import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AiCredentialError,
  isAuthRejection,
  projectHintFromRequest,
  resolveAiKey,
  withResolvedKey,
} from './aiCredentials.js';
import { _resetCredentialCache } from './aiCredentialCache.js';

/**
 * This module decides which customer's API key gets spent, and carries the
 * fail-closed rule that matters most: a BROKEN lookup must never silently fall
 * back to the platform's own key, because that would quietly bill us for every
 * tenant's usage and look exactly like everything working.
 */
const ENV_KEYS = [
  'AI_CREDENTIAL_SERVICE_TOKEN',
  'CONVEX_SITE_INTERNAL_URL',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'VITE_CONVEX_URL',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'OPENAI_API_KEY',
];

let saved: Record<string, string | undefined> = {};

const ctx = { clerkToken: 'clerk-jwt-abc', userId: 'user_1' };

function mockFetchOnce(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.AI_CREDENTIAL_SERVICE_TOKEN = 'service-token-value';
  process.env.CONVEX_SITE_INTERNAL_URL = 'http://127.0.0.1:13211';
  _resetCredentialCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveAiKey transport', () => {
  it('sends the service token in a header, never in the URL or body', () => {
    const fetchMock = mockFetchOnce({ credential: { apiKey: 'sk-co', source: 'company' } });
    return resolveAiKey('anthropic', ctx).then(() => {
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).not.toContain('service-token-value');
      expect(String(init.body)).not.toContain('service-token-value');
      expect(init.headers['x-aerogap-service-token']).toBe('service-token-value');
    });
  });

  it("forwards the caller's Clerk token as the user leg", async () => {
    const fetchMock = mockFetchOnce({ credential: { apiKey: 'sk-co', source: 'company' } });
    await resolveAiKey('anthropic', ctx);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer clerk-jwt-abc');
  });

  it('posts to the credential route on the resolved site URL', async () => {
    const fetchMock = mockFetchOnce({ credential: { apiKey: 'sk-co', source: 'company' } });
    await resolveAiKey('anthropic', ctx);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://127.0.0.1:13211/internal/ai-credential',
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('passes the project hint through so Convex can scope by owning company', async () => {
    const fetchMock = mockFetchOnce({ credential: { apiKey: 'sk-co', source: 'company' } });
    await resolveAiKey('anthropic', { ...ctx, projectId: 'proj_9' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      provider: 'anthropic',
      projectId: 'proj_9',
    });
  });
});

describe('resolveAiKey precedence', () => {
  it('returns a company credential when one exists', async () => {
    mockFetchOnce({ credential: { apiKey: 'sk-company', source: 'company', companyId: 'c1' } });
    const out = await resolveAiKey('anthropic', ctx);
    expect(out).toMatchObject({ apiKey: 'sk-company', source: 'company', companyId: 'c1' });
  });

  it('falls back to this runtime env when no row exists', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-from-env';
    mockFetchOnce({ credential: null });
    const out = await resolveAiKey('anthropic', ctx);
    expect(out).toMatchObject({ apiKey: 'sk-from-env', source: 'env' });
  });

  it('uses the per-provider env var, not a shared one', async () => {
    process.env.VOYAGE_API_KEY = 'voyage-env';
    process.env.ANTHROPIC_API_KEY = 'anthropic-env';
    mockFetchOnce({ credential: null });
    const out = await resolveAiKey('voyage', ctx);
    expect(out.apiKey).toBe('voyage-env');
  });

  it('reports an actionable error when nothing is configured anywhere', async () => {
    mockFetchOnce({ credential: null });
    await expect(resolveAiKey('anthropic', ctx)).rejects.toThrow(/Settings/);
  });
});

describe('fail-closed on a broken lookup', () => {
  it('does NOT fall back to env when the service token is unset', async () => {
    delete process.env.AI_CREDENTIAL_SERVICE_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key';
    const fetchMock = mockFetchOnce({ credential: null });

    await expect(resolveAiKey('anthropic', ctx)).rejects.toMatchObject({
      name: 'AiCredentialError',
      status: 503,
    });
    // The whole point: a misconfiguration must not route every tenant's spend
    // onto the platform key.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT fall back to env when no Convex site URL is resolvable', async () => {
    delete process.env.CONVEX_SITE_INTERNAL_URL;
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key';
    await expect(resolveAiKey('anthropic', ctx)).rejects.toMatchObject({ status: 503 });
  });

  it('does NOT fall back to env when the route errors', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key';
    mockFetchOnce('nope', 500);
    await expect(resolveAiKey('anthropic', ctx)).rejects.toBeInstanceOf(AiCredentialError);
  });

  it('does NOT fall back to env when the lookup cannot connect', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(resolveAiKey('anthropic', ctx)).rejects.toMatchObject({ status: 503 });
  });
});

describe('caching', () => {
  it('does not re-query within the TTL', async () => {
    const fetchMock = mockFetchOnce({ credential: { apiKey: 'sk-co', source: 'company' } });
    await resolveAiKey('anthropic', ctx);
    await resolveAiKey('anthropic', ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('queries separately per user', async () => {
    const fetchMock = mockFetchOnce({ credential: { apiKey: 'sk-co', source: 'company' } });
    await resolveAiKey('anthropic', ctx);
    await resolveAiKey('anthropic', { ...ctx, userId: 'user_2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('withResolvedKey retry', () => {
  function providerError(status: number) {
    return Object.assign(new Error('rejected'), { status });
  }

  it('retries exactly once after the provider rejects the key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ credential: { apiKey: 'stale-key', source: 'company' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ credential: { apiKey: 'rotated-key', source: 'company' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const seen: string[] = [];
    const result = await withResolvedKey('anthropic', ctx, async (apiKey) => {
      seen.push(apiKey);
      if (apiKey === 'stale-key') throw providerError(401);
      return 'ok';
    });

    expect(seen).toEqual(['stale-key', 'rotated-key']);
    expect(result).toBe('ok');
    // The eviction is what let the second lookup see the new value.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a second rejection instead of looping on a genuinely bad key', async () => {
    mockFetchOnce({ credential: { apiKey: 'bad-key', source: 'company' } });
    let attempts = 0;
    await expect(
      withResolvedKey('anthropic', ctx, async () => {
        attempts += 1;
        throw providerError(401);
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(attempts).toBe(2);
  });

  it('does not retry on a non-auth failure', async () => {
    mockFetchOnce({ credential: { apiKey: 'good-key', source: 'company' } });
    let attempts = 0;
    await expect(
      withResolvedKey('anthropic', ctx, async () => {
        attempts += 1;
        throw providerError(429);
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(attempts).toBe(1);
  });
});

describe('isAuthRejection', () => {
  it.each([[401, true], [403, true], [429, false], [500, false], [undefined, false]] as const)(
    'status %s -> %s',
    (status, expected) => {
      expect(isAuthRejection(status as number | undefined)).toBe(expected);
    },
  );
});

describe('projectHintFromRequest', () => {
  it('reads the lowercase header Node normalises to', () => {
    expect(projectHintFromRequest({ headers: { 'x-aerogap-project-id': 'p1' } })).toBe('p1');
  });

  it('tolerates a repeated header', () => {
    expect(projectHintFromRequest({ headers: { 'x-aerogap-project-id': ['p1', 'p2'] } })).toBe('p1');
  });

  it.each([
    ['absent', {}],
    ['blank', { 'x-aerogap-project-id': '   ' }],
    ['non-string', { 'x-aerogap-project-id': 42 }],
  ])('returns undefined when %s', (_label, headers) => {
    expect(projectHintFromRequest({ headers })).toBeUndefined();
  });
});
