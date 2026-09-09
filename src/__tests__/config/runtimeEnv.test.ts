import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * The precedence rules here decide whether one prebuilt installer can serve any
 * customer, so they are worth pinning down.
 *
 * Each test re-imports the module because the build-time fallbacks are captured
 * once at module load — which is the behaviour being tested, not an accident.
 */
const GLOBAL_KEY = '__AVIATION_APP_CONFIG__';

async function loadFresh() {
  vi.resetModules();
  return import('../../config/runtimeEnv');
}

function setInjected(value: unknown) {
  (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY] = value;
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY];
  vi.unstubAllEnvs();
});

describe('getConfigValue', () => {
  it('returns the injected runtime value when present', async () => {
    setInjected({ convexUrl: 'https://customer.local:3210' });
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('convexUrl')).toBe('https://customer.local:3210');
  });

  it('falls back to the build-time value when nothing is injected', async () => {
    vi.stubEnv('VITE_CONVEX_URL', 'https://built-in.example');
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('convexUrl')).toBe('https://built-in.example');
  });

  it('prefers the injected value over the build-time one', async () => {
    // This is the whole point: a prebuilt bundle carries one hostname, and the
    // install overrides it.
    vi.stubEnv('VITE_CONVEX_URL', 'https://built-in.example');
    setInjected({ convexUrl: 'https://customer.local:3210' });
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('convexUrl')).toBe('https://customer.local:3210');
  });

  it('treats an injected empty string as absent', async () => {
    // An unset variable renders as "" in the generated config. Letting that
    // override would blank a value the bundle legitimately carries.
    vi.stubEnv('VITE_CONVEX_URL', 'https://built-in.example');
    setInjected({ convexUrl: '' });
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('convexUrl')).toBe('https://built-in.example');
  });

  it('treats a whitespace-only injected value as absent', async () => {
    vi.stubEnv('VITE_CONVEX_URL', 'https://built-in.example');
    setInjected({ convexUrl: '   ' });
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('convexUrl')).toBe('https://built-in.example');
  });

  it('trims surrounding whitespace', async () => {
    setInjected({ clerkPublishableKey: '  pk_live_abc  ' });
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('clerkPublishableKey')).toBe('pk_live_abc');
  });

  it('returns undefined when neither source has a value', async () => {
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('logbookOcrEndpoint')).toBeUndefined();
  });

  it('survives a malformed injection rather than throwing', async () => {
    // A broken /config.js must degrade to build-time values; throwing during
    // module init would blank the entire application.
    setInjected('not an object');
    vi.stubEnv('VITE_CONVEX_URL', 'https://built-in.example');
    const { getConfigValue } = await loadFresh();
    expect(getConfigValue('convexUrl')).toBe('https://built-in.example');
  });

  it('survives a null injection', async () => {
    setInjected(null);
    const { getConfigValue } = await loadFresh();
    expect(() => getConfigValue('convexUrl')).not.toThrow();
  });
});

describe('hasRuntimeConfig', () => {
  it('is false when nothing is injected', async () => {
    const { hasRuntimeConfig } = await loadFresh();
    expect(hasRuntimeConfig()).toBe(false);
  });

  it('is true once a config is injected', async () => {
    setInjected({ convexUrl: 'https://x' });
    const { hasRuntimeConfig } = await loadFresh();
    expect(hasRuntimeConfig()).toBe(true);
  });
});
