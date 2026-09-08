import { describe, it, expect } from 'vitest';
import {
  REQUIRED_BACKEND_VARS,
  requiredAuthVars,
  buildBackendVars,
  generateServiceToken,
  readEnvValue,
} from '../scripts/lib/backendVars.mjs';

/**
 * What gets pushed INTO the Convex deployment.
 *
 * The exclusion half matters most. VOYAGE_API_KEY was never pushed, so
 * convex/documentChunks.ts threw INDEXING_UNAVAILABLE on every self-hosted
 * install even though the installer had collected a Voyage key — a bug that
 * survived for months because nothing asserted the two lists agreed. The fix
 * was to stop needing the push at all (keys live in the aiCredentials table, in
 * the same deployment that reads them), so re-adding those vars here would
 * reintroduce two sources of truth rather than repair anything.
 */
const ENV_WITH_EVERYTHING = [
  'CLERK_JWT_ISSUER_DOMAIN=clerk.example.com',
  'ANTHROPIC_API_KEY=sk-ant-legacy',
  'VOYAGE_API_KEY=pa-should-not-be-pushed',
  'OPENAI_API_KEY=sk-should-not-be-pushed',
  'EMBEDDING_PROVIDER=openai',
  'RESEND_API_KEY=re_xxx',
  'SMTP_FROM=noreply@example.com',
  'ADMIN_NOTIFY_EMAIL=admin@example.com',
].join('\n');

describe('readEnvValue', () => {
  it('reads a value', () => {
    expect(readEnvValue('A=1\nB=2', 'B')).toBe('2');
  });
  it('trims surrounding whitespace', () => {
    expect(readEnvValue('A=  spaced  ', 'A')).toBe('spaced');
  });
  it('returns empty for an absent key', () => {
    expect(readEnvValue('A=1', 'ZZZ')).toBe('');
  });
  it('does not match a key that merely ends with the name', () => {
    expect(readEnvValue('MY_API_KEY=1', 'API_KEY')).toBe('');
  });
});

describe('buildBackendVars', () => {
  const vars = buildBackendVars(ENV_WITH_EVERYTHING, 'token-value');

  it.each(['VOYAGE_API_KEY', 'OPENAI_API_KEY'])('never pushes %s to Convex', (key) => {
    expect(Object.keys(vars)).not.toContain(key);
    expect(JSON.stringify(vars)).not.toContain('should-not-be-pushed');
  });

  it('pushes the service token, so both runtimes share one value', () => {
    expect(vars.AI_CREDENTIAL_SERVICE_TOKEN).toBe('token-value');
  });

  it('pushes EMBEDDING_PROVIDER, which Convex reads at module load', () => {
    // If Convex and the app tier disagree, stored vectors and queries land in
    // different embedding spaces and similarity silently returns nonsense.
    expect(vars.EMBEDDING_PROVIDER).toBe('openai');
  });

  it('defaults EMBEDDING_PROVIDER rather than pushing an empty value', () => {
    expect(buildBackendVars('', 'tok').EMBEDDING_PROVIDER).toBe('voyage');
  });

  it('passes an existing Anthropic key through, for upgraded installs', () => {
    // The resolver keeps env as its last fallback rung, so an operator who
    // relied on a shared key before per-company keys existed keeps working.
    expect(vars.ANTHROPIC_API_KEY).toBe('sk-ant-legacy');
  });

  it('does NOT invent an Anthropic key when the install has none', () => {
    // A fresh install gets its key from the app instead.
    expect(Object.keys(buildBackendVars('', 'tok'))).not.toContain('ANTHROPIC_API_KEY');
  });

  it('carries the vars the rest of the backend needs', () => {
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('clerk.example.com');
    expect(vars.SIGNUP_EMAIL_FROM).toBe('noreply@example.com');
    expect(vars.ADMIN_NOTIFY_EMAIL).toBe('admin@example.com');
  });
});

describe('REQUIRED_BACKEND_VARS', () => {
  it('treats the service token as fatal regardless of who issues identities', () => {
    // Without it nothing can resolve an AI key at any scope, in either mode.
    expect([...REQUIRED_BACKEND_VARS].sort()).toEqual(['AI_CREDENTIAL_SERVICE_TOKEN']);
  });

  it('names only keys buildBackendVars actually produces', () => {
    const produced = Object.keys(buildBackendVars(ENV_WITH_EVERYTHING, 'tok'));
    for (const key of REQUIRED_BACKEND_VARS) expect(produced).toContain(key);
  });
});

describe('requiredAuthVars', () => {
  /**
   * Which auth variables are mandatory depends on who issues tokens.
   * convex/auth.config.ts reads them at DEPLOY time and throws without them, so
   * getting this wrong rejects the push - which is the right failure, but only
   * if the right set is demanded for the right mode.
   */
  it('demands the Clerk issuer in clerk mode', () => {
    expect(requiredAuthVars('clerk')).toEqual(['CLERK_JWT_ISSUER_DOMAIN']);
  });

  it('demands the local issuer and JWKS in local mode', () => {
    expect([...requiredAuthVars('local')].sort()).toEqual([
      'LOCAL_AUTH_ISSUER',
      'LOCAL_AUTH_JWKS_URL',
    ]);
  });

  it('does NOT demand Clerk configuration from a local-auth install', () => {
    // A self-hosted install has no Clerk instance at all. Requiring an issuer
    // domain there would make every on-prem deploy fail on a value that has no
    // meaning for it.
    expect(requiredAuthVars('local')).not.toContain('CLERK_JWT_ISSUER_DOMAIN');
  });

  it('defaults to clerk when the mode is absent or unrecognised', () => {
    // Existing installs have no AUTH_MODE line. Defaulting to `local` would
    // change how they authenticate on their next upgrade.
    for (const mode of [undefined, '', null, 'nonsense']) {
      expect(requiredAuthVars(mode as never)).toEqual(['CLERK_JWT_ISSUER_DOMAIN']);
    }
  });

  it('demands everything in both mode', () => {
    // Two trusted issuers means two sets of deploy-time variables.
    expect([...requiredAuthVars('both')].sort()).toEqual([
      'CLERK_JWT_ISSUER_DOMAIN',
      'LOCAL_AUTH_ISSUER',
      'LOCAL_AUTH_JWKS_URL',
    ]);
  });

  it('names only keys buildBackendVars can produce', () => {
    const produced = Object.keys(buildBackendVars(ENV_WITH_EVERYTHING, 'tok'));
    for (const mode of ['clerk', 'local', 'both']) {
      for (const key of requiredAuthVars(mode)) expect(produced).toContain(key);
    }
  });
});

describe('AUTH_MODE reaches the deployment', () => {
  it('is pushed, because auth.config.ts branches on it', () => {
    // A Convex function's process.env comes from the DEPLOYMENT's variables.
    // Setting AUTH_MODE only on the app server would leave auth.config.ts
    // building a Clerk provider for a local-auth install.
    expect(buildBackendVars('AUTH_MODE=local', 'tok').AUTH_MODE).toBe('local');
  });

  it('defaults to clerk when unset', () => {
    expect(buildBackendVars('', 'tok').AUTH_MODE).toBe('clerk');
  });
});

describe('generateServiceToken', () => {
  it('produces a 32-byte base64url token', () => {
    const token = generateServiceToken();
    // 32 bytes -> 43 base64 chars with no padding.
    expect(token).toHaveLength(43);
    // base64url only: nothing a shell or a naive .env parser would mangle.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is different every time', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateServiceToken()));
    expect(tokens.size).toBe(20);
  });
});
