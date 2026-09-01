import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyCors, allowedOrigins } from './cors.js';

/** Minimal res stub capturing status/headers for assertions. */
function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    ended: false,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

function makeReq(origin?: string, method = 'POST') {
  return { method, headers: origin ? { origin } : {} } as any;
}

const ENV_KEYS = ['APP_ORIGIN', 'ALLOWED_ORIGINS'] as const;

describe('allowedOrigins', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  describe('hosted deployment (APP_ORIGIN unset)', () => {
    it('trusts the production domains', () => {
      const origins = allowedOrigins();
      expect(origins.has('https://www.aerogaptechnologies.com')).toBe(true);
      expect(origins.has('https://aerogaptechnologies.com')).toBe(true);
    });

    it('trusts local dev origins', () => {
      const origins = allowedOrigins();
      expect(origins.has('http://localhost:5173')).toBe(true);
      expect(origins.has('https://localhost:5173')).toBe(true);
    });

    it('appends ALLOWED_ORIGINS for preview deployments', () => {
      process.env.ALLOWED_ORIGINS = 'https://preview-1.vercel.app, https://preview-2.vercel.app';
      const origins = allowedOrigins();
      expect(origins.has('https://preview-1.vercel.app')).toBe(true);
      expect(origins.has('https://preview-2.vercel.app')).toBe(true);
      // Defaults survive.
      expect(origins.has('https://www.aerogaptechnologies.com')).toBe(true);
    });
  });

  describe('self-hosted deployment (APP_ORIGIN set)', () => {
    it('trusts the install origin', () => {
      process.env.APP_ORIGIN = 'https://aerogap.acme.internal';
      expect(allowedOrigins().has('https://aerogap.acme.internal')).toBe(true);
    });

    it('DROPS the vendor domains — an on-prem install must not trust us', () => {
      process.env.APP_ORIGIN = 'https://aerogap.acme.internal';
      const origins = allowedOrigins();
      expect(origins.has('https://www.aerogaptechnologies.com')).toBe(false);
      expect(origins.has('https://aerogaptechnologies.com')).toBe(false);
    });

    it('DROPS localhost dev origins', () => {
      process.env.APP_ORIGIN = 'https://aerogap.acme.internal';
      expect(allowedOrigins().has('http://localhost:5173')).toBe(false);
    });

    it('still honours additional operator-configured origins', () => {
      process.env.APP_ORIGIN = 'https://aerogap.acme.internal';
      process.env.ALLOWED_ORIGINS = 'https://aerogap-alias.acme.internal';
      const origins = allowedOrigins();
      expect(origins.has('https://aerogap.acme.internal')).toBe(true);
      expect(origins.has('https://aerogap-alias.acme.internal')).toBe(true);
      expect(origins.size).toBe(2);
    });

    it('tolerates a trailing slash in APP_ORIGIN', () => {
      // Operators copy this out of a browser bar, which appends the slash.
      process.env.APP_ORIGIN = 'https://aerogap.acme.internal/';
      expect(allowedOrigins().has('https://aerogap.acme.internal')).toBe(true);
    });
  });
});

describe('applyCors', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('reflects an allowed origin and sets Vary', () => {
    const res = makeRes();
    applyCors(makeReq('https://www.aerogaptechnologies.com'), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://www.aerogaptechnologies.com');
    expect(res.headers['Vary']).toBe('Origin');
  });

  it('omits the allow-origin header for a disallowed origin', () => {
    const res = makeRes();
    applyCors(makeReq('https://evil.example.com'), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('does not set CORS headers when there is no Origin (same-origin call)', () => {
    const res = makeRes();
    applyCors(makeReq(undefined), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('answers preflight with 204 and reports it as handled', () => {
    const res = makeRes();
    const handled = applyCors(makeReq('https://www.aerogaptechnologies.com', 'OPTIONS'), res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it('allows every header the SPA actually sends on an AI request', () => {
    // A header missing from this list is blocked by the browser at preflight,
    // so a cross-origin install loses AI entirely with no server-side error to
    // find. X-AeroGap-Project-Id carries the billing-scope hint.
    const res = makeRes();
    applyCors(makeReq('https://www.aerogaptechnologies.com', 'OPTIONS'), res);
    const allowed = String(res.headers['Access-Control-Allow-Headers'])
      .split(',')
      .map((h) => h.trim().toLowerCase());
    expect(allowed).toEqual(
      expect.arrayContaining(['authorization', 'content-type', 'x-aerogap-project-id']),
    );
  });

  it('returns false for a normal request so the handler continues', () => {
    const res = makeRes();
    expect(applyCors(makeReq('https://www.aerogaptechnologies.com'), res)).toBe(false);
  });

  it('blocks the vendor origin against a self-hosted install', () => {
    process.env.APP_ORIGIN = 'https://aerogap.acme.internal';
    const res = makeRes();
    applyCors(makeReq('https://www.aerogaptechnologies.com'), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
