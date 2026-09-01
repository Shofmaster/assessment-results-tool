import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { describeConfig, requireConfig } from '../server/src/config.js';

/**
 * The boot gate decides whether a fresh install can start at all.
 *
 * It used to refuse without ANTHROPIC_API_KEY, which was right when the key
 * could only come from the environment. Now keys are added IN THE APP and
 * stored per company, so that gate would make the flow that adds them
 * unreachable — a deadlock. These tests pin the new shape in both directions:
 * an AI key is optional, and the service token that makes key lookup possible
 * at all is not.
 */
const MANAGED = [
  'APP_ORIGIN',
  'CONVEX_URL',
  'VITE_CONVEX_URL',
  'CONVEX_PUBLIC_URL',
  'AUTH_MODE',
  'DEPLOYMENT_MODE',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'CLERK_JWT_ISSUER_DOMAIN',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'AI_CREDENTIAL_SERVICE_TOKEN',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'OPENAI_API_KEY',
  'EMBEDDING_PROVIDER',
  'DOC_SERVER_UPSTREAM',
  'VITE_SENTRY_DSN',
  'VITE_POSTHOG_KEY',
  'BILLING_ENFORCEMENT_ENABLED',
];

let saved: Record<string, string | undefined> = {};

/** Everything a valid Clerk-mode install needs, and nothing more. */
function baseline(): void {
  process.env.APP_ORIGIN = 'https://aerogap.example.internal';
  process.env.CONVEX_URL = 'http://127.0.0.1:13210';
  process.env.AUTH_MODE = 'clerk';
  process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
  process.env.CLERK_JWT_ISSUER_DOMAIN = 'clerk.example.com';
  process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_xxx';
  process.env.AI_CREDENTIAL_SERVICE_TOKEN = 'service-token-value';
}

beforeEach(() => {
  saved = {};
  for (const k of MANAGED) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  baseline();
});

afterEach(() => {
  for (const k of MANAGED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

describe('AI provider keys are no longer a boot requirement', () => {
  it('boots with NO Anthropic key at all', () => {
    // This is the test that would catch a revert. A fresh install has no key by
    // construction: the admin adds one after signing in.
    expect(() => requireConfig()).not.toThrow();
  });

  it('boots with no embedding key either', () => {
    process.env.EMBEDDING_PROVIDER = 'voyage';
    expect(() => requireConfig()).not.toThrow();
  });

  it('reports the missing keys as warnings rather than swallowing them', () => {
    const config = requireConfig();
    expect(config.warnings.join(' ')).toMatch(/Anthropic/i);
    expect(config.warnings.join(' ')).toMatch(/VOYAGE_API_KEY/);
  });

  it('has no warnings once keys are present', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
    process.env.VOYAGE_API_KEY = 'pa-xxx';
    expect(requireConfig().warnings).toEqual([]);
  });

  it('warns about the openai key when that is the configured provider', () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.VOYAGE_API_KEY = 'pa-xxx';
    expect(requireConfig().warnings.join(' ')).toMatch(/OPENAI_API_KEY/);
  });
});

describe('the credential service token IS required', () => {
  it('refuses to boot without it', () => {
    // Without this, neither runtime can resolve a key at ANY scope, so every AI
    // request fails. Better a loud refusal at boot than a confusing 503 later.
    delete process.env.AI_CREDENTIAL_SERVICE_TOKEN;
    expect(() => requireConfig()).toThrow(/AI_CREDENTIAL_SERVICE_TOKEN/);
  });

  it('explains how to obtain one', () => {
    delete process.env.AI_CREDENTIAL_SERVICE_TOKEN;
    expect(() => requireConfig()).toThrow(/install\.ps1|bootstrap/i);
  });
});

describe('pre-existing gates still hold', () => {
  it.each([
    ['APP_ORIGIN', /APP_ORIGIN/],
    ['CLERK_SECRET_KEY', /CLERK_SECRET_KEY/],
    ['VITE_CLERK_PUBLISHABLE_KEY', /VITE_CLERK_PUBLISHABLE_KEY/],
  ])('still refuses to boot without %s', (key, pattern) => {
    delete process.env[key];
    expect(() => requireConfig()).toThrow(pattern);
  });

  it('refuses a Convex URL that is not a URL', () => {
    process.env.CONVEX_URL = 'not-a-url';
    expect(() => requireConfig()).toThrow(/CONVEX_URL/);
  });
});

describe('describeConfig', () => {
  it('never prints a secret value', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-SUPERSECRET';
    process.env.CLERK_SECRET_KEY = 'sk_test_SUPERSECRET';
    process.env.AI_CREDENTIAL_SERVICE_TOKEN = 'TOKEN-SUPERSECRET';
    const banner = describeConfig(requireConfig()).join('\n');
    expect(banner).not.toContain('SUPERSECRET');
  });

  it('reports AI key posture so an operator can confirm it', () => {
    const banner = describeConfig(requireConfig()).join('\n');
    expect(banner).toMatch(/ai keys/i);
    expect(banner).toMatch(/Settings > AI Keys/);
  });

  it('surfaces warnings in the banner', () => {
    const banner = describeConfig(requireConfig()).join('\n');
    expect(banner).toMatch(/!/);
  });
});

/**
 * Desktop mode changes what a valid install looks like.
 *
 * The point of the mode is that a customer never types configuration, so the
 * values a server install must be given per site are compiled into the desktop
 * build instead. These tests pin exactly which requirements relax and, more
 * importantly, which one does NOT: a runtime that cannot verify a token has to
 * refuse to start, or it would accept every request instead of none.
 */
describe('deployment mode', () => {
  it('defaults to server when unset, preserving existing installs', () => {
    expect(requireConfig().deploymentMode).toBe('server');
  });

  it('rejects an unrecognised mode rather than guessing', () => {
    process.env.DEPLOYMENT_MODE = 'kiosk';
    expect(() => requireConfig()).toThrow(/DEPLOYMENT_MODE/);
  });

  it('accepts CLERK_JWT_KEY instead of CLERK_SECRET_KEY', () => {
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----MIIB-----END PUBLIC KEY-----';
    expect(() => requireConfig()).not.toThrow();
  });

  it('refuses to start when it has NO way to verify a token in server mode', () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_KEY;
    process.env.DEPLOYMENT_MODE = 'server';
    process.env.AUTH_MODE = 'clerk';
    expect(() => requireConfig()).toThrow(/CLERK_JWT_KEY/);
  });

  it('uses local auth in desktop mode without Clerk credentials', () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_KEY;
    process.env.DEPLOYMENT_MODE = 'desktop';
    process.env.APP_ORIGIN = 'http://127.0.0.1:19080';
    delete process.env.AUTH_MODE;
    expect(requireConfig().authMode).toBe('local');
  });

  it('does not require Clerk values in desktop mode', () => {
    process.env.DEPLOYMENT_MODE = 'desktop';
    process.env.APP_ORIGIN = 'http://127.0.0.1:19080';
    delete process.env.AUTH_MODE;
    delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_KEY;

    const config = requireConfig();
    expect(config.deploymentMode).toBe('desktop');
    expect(config.authMode).toBe('local');
  });

  it('still requires them in server mode', () => {
    delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    expect(() => requireConfig()).toThrow(/CLERK_JWT_ISSUER_DOMAIN/);
  });

  it('keeps the service token fatal in desktop mode too', () => {
    // The desktop shell generates this before starting the server. If that ever
    // regresses, every AI request 503s with a confusing message - so the boot
    // gate stays strict rather than trusting the shell.
    process.env.DEPLOYMENT_MODE = 'desktop';
    delete process.env.AI_CREDENTIAL_SERVICE_TOKEN;
    expect(() => requireConfig()).toThrow(/AI_CREDENTIAL_SERVICE_TOKEN/);
  });

  it('does not warn about http:// on loopback in desktop mode', () => {
    const warn = console.warn;
    const seen: string[] = [];
    console.warn = (...args: unknown[]) => void seen.push(args.join(' '));
    try {
      process.env.DEPLOYMENT_MODE = 'desktop';
      process.env.APP_ORIGIN = 'http://127.0.0.1:19080';
      requireConfig();
      expect(seen.join(' ')).not.toMatch(/insecure context/);

      // ...but a server install on plain http is still a real mistake.
      process.env.DEPLOYMENT_MODE = 'server';
      requireConfig();
      expect(seen.join(' ')).toMatch(/insecure context/);
    } finally {
      console.warn = warn;
    }
  });

  it('reports the mode in the startup banner', () => {
    process.env.DEPLOYMENT_MODE = 'desktop';
    expect(describeConfig(requireConfig()).join(' | ')).toMatch(/mode\s+desktop/);
  });

  it('forces local auth in desktop mode', () => {
    process.env.DEPLOYMENT_MODE = 'desktop';
    process.env.APP_ORIGIN = 'http://127.0.0.1:19080';
    delete process.env.AUTH_MODE;
    delete process.env.CLERK_JWT_KEY;
    delete process.env.CLERK_SECRET_KEY;
    expect(requireConfig().authMode).toBe('local');
  });
});
