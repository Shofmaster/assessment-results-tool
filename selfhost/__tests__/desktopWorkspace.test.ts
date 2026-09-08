import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  normalizeHostedUrl,
  resolveHostedAppUrl,
  readWorkspacePreference,
  writeWorkspacePreference,
  decideWorkspace,
  ONLINE_START_PATH,
  PREFERENCE_FILE,
  DEFAULT_PREFERENCE,
} = require_('../desktop/desktopWorkspace.cjs');

describe('normalizeHostedUrl', () => {
  it('reduces a URL to its https origin', () => {
    expect(normalizeHostedUrl('https://app.example.com/some/path?x=1')).toBe('https://app.example.com');
    expect(normalizeHostedUrl('  https://app.example.com/  ')).toBe('https://app.example.com');
  });

  it('assumes https for a bare host', () => {
    expect(normalizeHostedUrl('app.example.com')).toBe('https://app.example.com');
  });

  it('refuses anything that is not https - the URL receives the hosted session', () => {
    expect(normalizeHostedUrl('http://app.example.com')).toBeNull();
    expect(normalizeHostedUrl('ftp://app.example.com')).toBeNull();
  });

  it('is null for empty or garbage input', () => {
    expect(normalizeHostedUrl('')).toBeNull();
    expect(normalizeHostedUrl(undefined)).toBeNull();
    expect(normalizeHostedUrl('not a url at all ://')).toBeNull();
  });
});

describe('resolveHostedAppUrl', () => {
  let installDir: string;
  let configDir: string;

  beforeEach(() => {
    installDir = mkdtempSync(join(tmpdir(), 'aerogap-ws-install-'));
    configDir = mkdtempSync(join(tmpdir(), 'aerogap-ws-config-'));
  });
  afterEach(() => {
    rmSync(installDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it('reads the URL baked into build-config.json', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify({ HOSTED_APP_URL: 'https://app.example.com' }));
    expect(resolveHostedAppUrl({ installDir, configDir })).toBe('https://app.example.com');
  });

  it('is null for a build without one - every build before workspaces existed', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify({ EMBEDDING_PROVIDER: 'voyage' }));
    expect(resolveHostedAppUrl({ installDir, configDir })).toBeNull();
  });

  it('is null when build-config.json is missing or corrupt', () => {
    expect(resolveHostedAppUrl({ installDir, configDir })).toBeNull();
    writeFileSync(join(installDir, 'build-config.json'), '{ not json');
    expect(resolveHostedAppUrl({ installDir, configDir })).toBeNull();
  });

  it('lets config\\.env override the build', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify({ HOSTED_APP_URL: 'https://app.example.com' }));
    writeFileSync(join(configDir, '.env'), 'HOSTED_APP_URL=https://aerogap.customer.example\n');
    expect(resolveHostedAppUrl({ installDir, configDir })).toBe('https://aerogap.customer.example');
  });

  it('treats an EMPTY .env value as opting out of the online workspace', () => {
    writeFileSync(join(installDir, 'build-config.json'), JSON.stringify({ HOSTED_APP_URL: 'https://app.example.com' }));
    writeFileSync(join(configDir, '.env'), 'HOSTED_APP_URL=\n');
    expect(resolveHostedAppUrl({ installDir, configDir })).toBeNull();
  });
});

describe('workspace preference', () => {
  let configDir: string;
  beforeEach(() => {
    configDir = join(mkdtempSync(join(tmpdir(), 'aerogap-ws-pref-')), 'config');
  });
  afterEach(() => rmSync(join(configDir, '..'), { recursive: true, force: true }));

  it('defaults to offline when nothing was ever saved - the desktop IS the local workspace', () => {
    expect(DEFAULT_PREFERENCE).toBe('offline');
    expect(readWorkspacePreference(configDir)).toBe('offline');
  });

  it('round-trips the online opt-in, creating the directory on first write', () => {
    expect(existsSync(configDir)).toBe(false);
    writeWorkspacePreference(configDir, 'auto');
    expect(readWorkspacePreference(configDir)).toBe('auto');
    expect(JSON.parse(readFileSync(join(configDir, PREFERENCE_FILE), 'utf8'))).toEqual({ workspace: 'auto' });
    writeWorkspacePreference(configDir, 'offline');
    expect(readWorkspacePreference(configDir)).toBe('offline');
  });

  it('collapses anything that is not the explicit opt-in to offline', () => {
    mkdirSync(configDir, { recursive: true });
    // 'online' was never a valid value; a hand-edited file must not turn the probe on.
    writeFileSync(join(configDir, PREFERENCE_FILE), JSON.stringify({ workspace: 'online' }));
    expect(readWorkspacePreference(configDir)).toBe('offline');
    writeFileSync(join(configDir, PREFERENCE_FILE), '{ corrupt');
    expect(readWorkspacePreference(configDir)).toBe('offline');
    writeWorkspacePreference(configDir, 'anything-else' as never);
    expect(readWorkspacePreference(configDir)).toBe('offline');
  });
});

describe('decideWorkspace', () => {
  const hostedUrl = 'https://app.example.com';

  it('is offline, without asking, when the build has no hosted URL', () => {
    expect(decideWorkspace({ hostedUrl: null, preference: 'auto', reachable: true })).toBe('offline');
    expect(decideWorkspace({ hostedUrl: null, preference: 'auto', reachable: null })).toBe('offline');
  });

  it('honours an offline preference before any network probe', () => {
    expect(decideWorkspace({ hostedUrl, preference: 'offline', reachable: null })).toBe('offline');
    // Even when the network would have allowed online.
    expect(decideWorkspace({ hostedUrl, preference: 'offline', reachable: true })).toBe('offline');
  });

  it('goes online when the hosted app answers', () => {
    expect(decideWorkspace({ hostedUrl, preference: 'auto', reachable: true })).toBe('online');
  });

  it('asks - never silently falls back - when the hosted app does not answer', () => {
    expect(decideWorkspace({ hostedUrl, preference: 'auto', reachable: false })).toBe('ask');
    // Not probed yet is the same as not reachable: the caller must probe.
    expect(decideWorkspace({ hostedUrl, preference: 'auto', reachable: null })).toBe('ask');
  });

  it('starts the online workspace away from the marketing landing page', () => {
    expect(ONLINE_START_PATH).not.toBe('/');
    expect(ONLINE_START_PATH.startsWith('/')).toBe(true);
  });
});
