import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBuildConfig, describeBuildConfig, BAKEABLE_KEYS } from '../server/src/buildConfig.js';

/**
 * build-config.json is what lets the installers stop asking for Clerk values.
 *
 * It ships unencrypted inside every customer's install directory, so the
 * interesting tests are not "does it load" but "what can it refuse to load".
 * A regression here does not break a build - it silently distributes a secret
 * to every site, and the only way to withdraw it is to re-ship the installer.
 */
const MANAGED = [...BAKEABLE_KEYS, 'CLERK_SECRET_KEY', 'ANTHROPIC_API_KEY', 'AI_CREDENTIAL_SERVICE_TOKEN'];

let dir: string;
let file: string;
let saved: Record<string, string | undefined> = {};

function write(config: Record<string, unknown>) {
  writeFileSync(file, JSON.stringify(config), 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aerogap-buildcfg-'));
  file = join(dir, 'build-config.json');
  saved = {};
  for (const k of MANAGED) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of MANAGED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('what a build may bake in', () => {
  it('applies the allowed public values', () => {
    write({
      CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com',
      CLERK_JWT_KEY: 'public-pem',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_abc',
    });

    const result = applyBuildConfig(file);
    expect(result.applied.sort()).toEqual([
      'CLERK_JWT_ISSUER_DOMAIN',
      'CLERK_JWT_KEY',
      'VITE_CLERK_PUBLISHABLE_KEY',
    ]);
    expect(process.env.CLERK_JWT_KEY).toBe('public-pem');
  });

  it('REFUSES a secret key and never puts it in the environment', () => {
    // The whole point of the design. If this test ever fails, a build is one
    // mistake away from shipping tenant-wide token-minting capability to every
    // customer - and it cannot be rotated without re-shipping the installer.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    write({ CLERK_SECRET_KEY: 'sk_live_super_secret', CLERK_JWT_KEY: 'public-pem' });

    const result = applyBuildConfig(file);

    expect(process.env.CLERK_SECRET_KEY).toBeUndefined();
    expect(result.rejected).toContain('CLERK_SECRET_KEY');
    expect(result.applied).toEqual(['CLERK_JWT_KEY']);
    // Loud, because the only way this happens is a bug in the build script.
    expect(error).toHaveBeenCalled();
  });

  it.each(['ANTHROPIC_API_KEY', 'AI_CREDENTIAL_SERVICE_TOKEN', 'CONVEX_SELF_HOSTED_ADMIN_KEY'])(
    'refuses %s',
    (key) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      write({ [key]: 'value' });
      expect(applyBuildConfig(file).rejected).toContain(key);
      expect(process.env[key]).toBeUndefined();
    },
  );

  it('refuses anything not on the allowlist, not just the named secrets', () => {
    // An allowlist, not a denylist: a key nobody thought to forbid is still
    // refused rather than applied by default.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    write({ SOME_FUTURE_CREDENTIAL: 'value' });
    expect(applyBuildConfig(file).rejected).toContain('SOME_FUTURE_CREDENTIAL');
  });
});

describe('precedence', () => {
  it('never overrides a real environment variable', () => {
    // This is what keeps ONE artifact generic. A server-mode site pointing at a
    // different Clerk instance sets the variable, and the baked value defers.
    process.env.CLERK_JWT_ISSUER_DOMAIN = 'https://clerk.customer.internal';
    write({ CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com' });

    const result = applyBuildConfig(file);
    expect(process.env.CLERK_JWT_ISSUER_DOMAIN).toBe('https://clerk.customer.internal');
    expect(result.overridden).toContain('CLERK_JWT_ISSUER_DOMAIN');
    expect(result.applied).not.toContain('CLERK_JWT_ISSUER_DOMAIN');
  });

  it('treats an empty environment variable as absent', () => {
    // Setting a variable to '' DELETES it on Windows, so an empty string here
    // means "not configured" rather than "deliberately blank".
    process.env.CLERK_JWT_KEY = '';
    write({ CLERK_JWT_KEY: 'public-pem' });
    applyBuildConfig(file);
    expect(process.env.CLERK_JWT_KEY).toBe('public-pem');
  });

  it('ignores blank values in the file rather than blanking the variable', () => {
    write({ CLERK_JWT_KEY: '   ' });
    const result = applyBuildConfig(file);
    expect(result.applied).not.toContain('CLERK_JWT_KEY');
    expect(process.env.CLERK_JWT_KEY).toBeUndefined();
  });
});

describe('robustness', () => {
  it('is a no-op when the file does not exist', () => {
    // A development run has no baked config, and neither does a build that
    // deliberately ships none. Absence is normal, not an error.
    const result = applyBuildConfig(join(dir, 'missing.json'));
    expect(result).toMatchObject({ loaded: false, applied: [] });
  });

  it('does not throw on a corrupt file', () => {
    // Every value it carries can also come from the environment, so a damaged
    // optional file must not be able to stop an install from booting.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(file, '{ not json', 'utf8');
    expect(() => applyBuildConfig(file)).not.toThrow();
    expect(applyBuildConfig(file).loaded).toBe(false);
  });

  it('summarises itself for the startup banner', () => {
    write({ CLERK_JWT_KEY: 'public-pem' });
    const line = describeBuildConfig(applyBuildConfig(file));
    expect(line).toMatch(/build config/);
    expect(line).toMatch(/1 value/);
  });

  it('reports nothing when no build config was loaded', () => {
    expect(describeBuildConfig(applyBuildConfig(join(dir, 'missing.json')))).toBeNull();
  });
});
