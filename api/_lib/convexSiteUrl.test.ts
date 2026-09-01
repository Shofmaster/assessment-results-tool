import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConvexSiteUrl } from './convexSiteUrl.js';

/**
 * Getting this wrong is how the self-host install broke before: the .env said
 * CONVEX_URL=http://127.0.0.1:3210, but 3210 is the TLS reverse proxy bound to
 * the public hostname, and the backend actually listens on 13210. Every request
 * then failed with a confusing 503 that looked like an API-key problem.
 */
const KEYS = ['CONVEX_SITE_INTERNAL_URL', 'CONVEX_SITE_URL', 'CONVEX_URL', 'VITE_CONVEX_URL'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

describe('resolveConvexSiteUrl', () => {
  it('returns null when nothing is configured, rather than guessing', () => {
    expect(resolveConvexSiteUrl()).toBeNull();
  });

  it('prefers the internal loopback override above everything else', () => {
    // Self-host: going through the public port means a TLS hop through a proxy
    // that may present an internal CA the server does not trust.
    process.env.CONVEX_SITE_INTERNAL_URL = 'http://127.0.0.1:13211';
    process.env.CONVEX_SITE_URL = 'https://host:3211';
    process.env.CONVEX_URL = 'https://tidy-otter-1.convex.cloud';
    expect(resolveConvexSiteUrl()).toBe('http://127.0.0.1:13211');
  });

  it('uses an explicit site URL when there is no internal override', () => {
    process.env.CONVEX_SITE_URL = 'https://tidy-otter-1.convex.site';
    expect(resolveConvexSiteUrl()).toBe('https://tidy-otter-1.convex.site');
  });

  it('derives the site origin from a Convex Cloud functions origin', () => {
    process.env.CONVEX_URL = 'https://tidy-otter-1.convex.cloud';
    expect(resolveConvexSiteUrl()).toBe('https://tidy-otter-1.convex.site');
  });

  it('falls back to VITE_CONVEX_URL for derivation', () => {
    process.env.VITE_CONVEX_URL = 'https://tidy-otter-1.convex.cloud';
    expect(resolveConvexSiteUrl()).toBe('https://tidy-otter-1.convex.site');
  });

  it('does NOT invent a site origin for a self-hosted host:port', () => {
    // There is no derivable site origin here, and guessing a port would
    // reproduce the 3210-vs-13210 bug. null makes the caller fail loudly.
    process.env.CONVEX_URL = 'http://127.0.0.1:13210';
    expect(resolveConvexSiteUrl()).toBeNull();
  });

  it('strips trailing slashes so the path join stays well formed', () => {
    process.env.CONVEX_SITE_INTERNAL_URL = 'http://127.0.0.1:13211//';
    expect(resolveConvexSiteUrl()).toBe('http://127.0.0.1:13211');
  });

  it('ignores whitespace-only values', () => {
    process.env.CONVEX_SITE_INTERNAL_URL = '   ';
    process.env.CONVEX_SITE_URL = 'https://tidy-otter-1.convex.site';
    expect(resolveConvexSiteUrl()).toBe('https://tidy-otter-1.convex.site');
  });
});
