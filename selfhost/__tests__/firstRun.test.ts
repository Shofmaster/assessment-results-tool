import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDesktopBackendVars,
  localAuthIssuerFor,
  localAuthJwksUrlFor,
} from '../scripts/lib/backendVars.mjs';

const require_ = createRequire(import.meta.url);
const { FirstRun, orderedEnvEntries } = require_('../desktop/firstRun.cjs');
const { relaxSameSite, isOAuthProviderHost, withAccountChooser } = require_('../desktop/desktopAuth.cjs');

describe('withAccountChooser', () => {
  // Exact shape Clerk sent the desktop window, captured over CDP.
  const clerkGoogle =
    'https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=x.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fclerk.example.com%2Fv1%2Foauth_callback&response_type=code&scope=openid&state=abc';

  it('adds prompt=select_account to a Google authorization request', () => {
    const out = withAccountChooser(new URL(clerkGoogle));
    expect(out).not.toBeNull();
    const url = new URL(out!);
    expect(url.searchParams.get('prompt')).toBe('select_account');
    // Everything Clerk sent is preserved.
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('redirect_uri')).toBe('https://clerk.example.com/v1/oauth_callback');
    expect(withAccountChooser(new URL(clerkGoogle.replace('/o/oauth2/auth', '/o/oauth2/v2/auth')))).not.toBeNull();
  });

  it('respects a prompt Clerk already chose', () => {
    expect(withAccountChooser(new URL(`${clerkGoogle}&prompt=consent`))).toBeNull();
  });

  it('touches nothing else', () => {
    expect(withAccountChooser(new URL('https://accounts.google.com/signin/oauth/consent'))).toBeNull();
    expect(withAccountChooser(new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'))).toBeNull();
    expect(withAccountChooser(new URL('https://clerk.example.com/v1/oauth_callback?code=1'))).toBeNull();
  });
});

describe('isOAuthProviderHost', () => {
  // Clerk's "Continue with Google" sends the window straight here, not via
  // Clerk's own host; the shell must keep it in-window or the sign-in
  // completes in the system browser, where Clerk has no session for it.
  it('recognises the Google authorization page Clerk redirects to', () => {
    const url = new URL(
      'https://accounts.google.com/o/oauth2/auth?client_id=x&redirect_uri=https%3A%2F%2Fclerk.example.com%2Fv1%2Foauth_callback&state=abc',
    );
    expect(isOAuthProviderHost(url)).toBe(true);
  });

  it('accepts subdomains of a provider but not look-alikes', () => {
    expect(isOAuthProviderHost(new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'))).toBe(true);
    expect(isOAuthProviderHost(new URL('https://eu.accounts.google.com/x'))).toBe(true);
    expect(isOAuthProviderHost(new URL('https://accounts.google.com.evil.example/x'))).toBe(false);
    expect(isOAuthProviderHost(new URL('https://notgithub.com/login'))).toBe(false);
  });

  it('never matches plain http or unrelated sites', () => {
    expect(isOAuthProviderHost(new URL('http://accounts.google.com/'))).toBe(false);
    expect(isOAuthProviderHost(new URL('https://docs.aerogaptechnologies.com/help'))).toBe(false);
  });
});

describe('relaxSameSite', () => {
  // Clerk's real header shape, captured from the production instance.
  const clerk =
    '__client=eyJ.abc; Path=/; Domain=clerk.example.com; Max-Age=315360000; HttpOnly; Secure; SameSite=Lax';

  it('turns SameSite=Lax into None and keeps everything else', () => {
    expect(relaxSameSite(clerk)).toBe(
      '__client=eyJ.abc; Path=/; Domain=clerk.example.com; Max-Age=315360000; HttpOnly; Secure; SameSite=None',
    );
  });

  it('handles Strict, lower-case attributes and a missing Secure', () => {
    expect(relaxSameSite('a=1; samesite=strict')).toBe('a=1; SameSite=None; Secure');
    expect(relaxSameSite('a=1; Path=/')).toBe('a=1; Path=/; SameSite=None; Secure');
  });

  it('leaves an already cross-site cookie alone', () => {
    const cf = '__cf_bm=x; path=/; HttpOnly; Secure; SameSite=None';
    expect(relaxSameSite(cf)).toBe(cf);
  });
});

describe('orderedEnvEntries', () => {
  // Convex re-validates the currently deployed auth.config.ts after every
  // single `env set`, so on an upgrade the previous version's config must stay
  // valid at each step of the push.
  it('pushes real URLs before AUTH_MODE and placeholders after it (local -> both upgrade)', () => {
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'tok',
      authMode: 'both',
      clerkIssuerDomain: 'https://clerk.example.com',
    });
    const keys = orderedEnvEntries(vars).map(([key]: [string, string]) => key);
    const at = (key: string) => keys.indexOf(key);

    expect(at('CLERK_JWT_ISSUER_DOMAIN')).toBeLessThan(at('AUTH_MODE'));
    expect(at('LOCAL_AUTH_ISSUER')).toBeLessThan(at('AUTH_MODE'));
    expect(at('LOCAL_AUTH_JWKS_URL')).toBeLessThan(at('AUTH_MODE'));
    // Nothing in this shape is 'unused' except the encryption key placeholder.
    expect(at('AI_CREDENTIAL_ENCRYPTION_KEY')).toBeGreaterThan(at('AUTH_MODE'));
  });

  it('pushes AUTH_MODE before the placeholder the new mode stops reading (both -> local opt-out)', () => {
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'tok',
      authMode: 'local',
      clerkIssuerDomain: 'https://clerk.example.com',
    });
    const keys = orderedEnvEntries(vars).map(([key]: [string, string]) => key);
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('unused');
    expect(keys.indexOf('AUTH_MODE')).toBeLessThan(keys.indexOf('CLERK_JWT_ISSUER_DOMAIN'));
  });

  it('drops empty values and keeps the original order within a rank', () => {
    const entries = orderedEnvEntries({ B: 'x', A: '', C: 'unused', AUTH_MODE: 'local', D: 'y' });
    expect(entries).toEqual([
      ['B', 'x'],
      ['D', 'y'],
      ['AUTH_MODE', 'local'],
      ['C', 'unused'],
    ]);
  });
});

describe('buildDesktopBackendVars', () => {
  it('pushes local auth variables derived from the app origin', () => {
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'svc-token',
      envFileRaw: 'AI_CREDENTIAL_SERVICE_TOKEN=svc-token\nAI_CREDENTIAL_ENCRYPTION_KEY=enc-key\n',
    });

    expect(vars.AUTH_MODE).toBe('local');
    expect(vars.DEPLOYMENT_MODE).toBe('desktop');
    expect(vars.LOCAL_AUTH_ISSUER).toBe(localAuthIssuerFor('http://127.0.0.1:19080'));
    expect(vars.LOCAL_AUTH_JWKS_URL).toBe(localAuthJwksUrlFor('http://127.0.0.1:19080'));
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('unused');
    expect(vars.AI_CREDENTIAL_SERVICE_TOKEN).toBe('svc-token');
    expect(vars.AI_CREDENTIAL_ENCRYPTION_KEY).toBe('enc-key');
  });

  it('pushes both issuers when the hosted-account option is on', () => {
    // convex/auth.config.ts builds a provider per issuer from these, so a
    // desktop offering the hosted account must push the Clerk domain too.
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'svc-token',
      authMode: 'both',
      clerkIssuerDomain: 'https://clerk.example.com',
    });
    expect(vars.AUTH_MODE).toBe('both');
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('https://clerk.example.com');
    expect(vars.LOCAL_AUTH_ISSUER).toBe(localAuthIssuerFor('http://127.0.0.1:19080'));
  });

  it('falls back to local when asked for both without a Clerk issuer', () => {
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'svc-token',
      authMode: 'both',
    });
    expect(vars.AUTH_MODE).toBe('local');
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('unused');
  });

  it('is not overridden by a stray AUTH_MODE line in the user env file', () => {
    // The env file holds generated secrets; which issuers to trust is decided
    // by the resolver. A user typing AUTH_MODE=clerk must not remove local
    // accounts from their own desktop.
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'svc-token',
      envFileRaw: 'AUTH_MODE=clerk\nCLERK_JWT_ISSUER_DOMAIN=https://wrong.example.com\n',
      authMode: 'local',
    });
    expect(vars.AUTH_MODE).toBe('local');
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('unused');
  });
});

describe('resolveDesktopAuth', () => {
  const { resolveDesktopAuth } = require_('../desktop/desktopAuth.cjs');
  let installDir: string;
  let configDir: string;

  beforeEach(() => {
    installDir = mkdtempSync(join(tmpdir(), 'aerogap-install-'));
    configDir = mkdtempSync(join(tmpdir(), 'aerogap-config-'));
  });

  afterEach(() => {
    rmSync(installDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  const CLERK = {
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x',
    CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
  };

  it('is local when the build carries no Clerk configuration', () => {
    expect(resolveDesktopAuth({ installDir, configDir }).authMode).toBe('local');
  });

  it('is local when the Clerk configuration is incomplete', () => {
    // All three are needed: one to verify at the API tier, one to render the
    // form, one for Convex to trust. Two out of three is a broken button.
    const { CLERK_JWT_KEY: _omitted, ...partial } = CLERK;
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify(partial), 'utf8');
    expect(resolveDesktopAuth({ installDir, configDir }).authMode).toBe('local');
  });

  it('offers both when the build carries the full public Clerk trio', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify(CLERK), 'utf8');
    const auth = resolveDesktopAuth({ installDir, configDir });
    expect(auth.authMode).toBe('both');
    expect(auth.clerkIssuerDomain).toBe('https://clerk.example.com');
  });

  it('honours an explicit AUTH_MODE=local opt-out in the user env file', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify(CLERK), 'utf8');
    writeFileSync(join(configDir, '.env'), 'AI_CREDENTIAL_SERVICE_TOKEN=t\nAUTH_MODE=local\n', 'utf8');
    expect(resolveDesktopAuth({ installDir, configDir }).authMode).toBe('local');
  });

  it('never yields clerk alone on a desktop', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify(CLERK), 'utf8');
    writeFileSync(join(configDir, '.env'), 'AUTH_MODE=clerk\n', 'utf8');
    expect(resolveDesktopAuth({ installDir, configDir }).authMode).toBe('both');
  });
});

describe('FirstRun marker', () => {
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(join(tmpdir(), 'aerogap-firstrun-'));
    mkdirSync(join(dataRoot, 'config'), { recursive: true });
    writeFileSync(join(dataRoot, 'config', 'instance-secret'), 'a'.repeat(64), 'utf8');
    writeFileSync(
      join(dataRoot, 'config', '.env'),
      'AI_CREDENTIAL_SERVICE_TOKEN=test-token\nAI_CREDENTIAL_ENCRYPTION_KEY=enc-key\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('requires matching ports and app origin in the deployed marker', () => {
    const ports = { convex: 14210, convexSite: 14211, app: 19080 };
    const firstRun = new FirstRun({
      installDir: join(tmpdir(), 'missing-install'),
      dataRoot,
      ports,
      instanceName: 'aerogap_desktop',
    });

    writeFileSync(
      join(dataRoot, 'config', 'deployed.json'),
      JSON.stringify({
        version: firstRun.appVersion(),
        instanceName: 'aerogap_desktop',
        appOrigin: 'http://127.0.0.1:19080',
        ports,
        convexFingerprint: firstRun.convexFingerprint(),
      }),
      'utf8',
    );

    expect(firstRun.alreadyDeployed()).toBe(true);

    firstRun.ports = { ...ports, app: 19081 };
    expect(firstRun.alreadyDeployed()).toBe(false);
  });

  it('re-deploys when the auth mode changes, and reads an old marker as local', () => {
    // Convex reads AUTH_MODE at deploy time. A build that gains the hosted
    // option (or a user opting out of it) must re-push the environment, or the
    // sign-in screen offers a provider the database does not trust.
    const ports = { convex: 14210, convexSite: 14211, app: 19080 };
    const installDir = mkdtempSync(join(tmpdir(), 'aerogap-install-'));
    try {
      const firstRun = new FirstRun({ installDir, dataRoot, ports, instanceName: 'aerogap_desktop' });
      const marker = {
        version: firstRun.appVersion(),
        instanceName: 'aerogap_desktop',
        appOrigin: 'http://127.0.0.1:19080',
        ports,
        convexFingerprint: firstRun.convexFingerprint(),
      };
      // Marker predating authMode: the install was local, and still is.
      writeFileSync(join(dataRoot, 'config', 'deployed.json'), JSON.stringify(marker), 'utf8');
      expect(firstRun.alreadyDeployed()).toBe(true);

      // Same install upgraded to a build carrying Clerk values.
      writeFileSync(
        join(installDir, 'build-config.json'),
        JSON.stringify({
          CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com',
          VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x',
          CLERK_JWT_KEY: 'pem',
        }),
        'utf8',
      );
      expect(firstRun.alreadyDeployed()).toBe(false);

      firstRun.markDeployed();
      const written = JSON.parse(readFileSync(join(dataRoot, 'config', 'deployed.json'), 'utf8'));
      expect(written.authMode).toBe('both');
      expect(written.convexFingerprint).toBe(firstRun.convexFingerprint());
      expect(firstRun.alreadyDeployed()).toBe(true);
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it('re-deploys when staged Convex sources change at the same app version', () => {
    const ports = { convex: 14210, convexSite: 14211, app: 19080 };
    const installDir = mkdtempSync(join(tmpdir(), 'aerogap-install-'));
    try {
      mkdirSync(join(installDir, 'convex-src', 'convex'), { recursive: true });
      writeFileSync(join(installDir, 'convex-src', 'convex.json'), '{}\n', 'utf8');
      writeFileSync(join(installDir, 'convex-src', 'convex', 'schema.ts'), 'export {};\n', 'utf8');
      writeFileSync(join(installDir, 'convex-src', 'convex', 'documents.ts'), 'export const a = 1;\n', 'utf8');
      writeFileSync(join(installDir, 'convex-src', 'convex', 'auth.config.ts'), 'export default {};\n', 'utf8');

      const firstRun = new FirstRun({ installDir, dataRoot, ports, instanceName: 'aerogap_desktop' });
      firstRun.markDeployed();
      expect(firstRun.alreadyDeployed()).toBe(true);

      writeFileSync(
        join(installDir, 'convex-src', 'convex', 'documents.ts'),
        'export const registerLocalFolderRefs = 1;\n',
        'utf8',
      );
      expect(firstRun.alreadyDeployed()).toBe(false);

      firstRun.markDeployed();
      expect(firstRun.alreadyDeployed()).toBe(true);
      writeFileSync(
        join(installDir, 'convex-src', 'convex', 'companies.ts'),
        'export const getFeaturePolicy = 1;\n',
        'utf8',
      );
      expect(firstRun.alreadyDeployed()).toBe(false);

      firstRun.markDeployed();
      expect(firstRun.alreadyDeployed()).toBe(true);
      writeFileSync(
        join(installDir, 'convex-src', 'convex', 'userSettings.ts'),
        'export const get = 1;\n',
        'utf8',
      );
      expect(firstRun.alreadyDeployed()).toBe(false);
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });
});
