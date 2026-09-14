import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  argValue,
  resolveMode,
  resolveServerUrl,
  isAppOrigin,
  fileArgument,
  isSafeExternalUrl,
  DEFAULT_SERVER_URL,
} = require_('../desktop/shellHelpers.cjs');

describe('argValue', () => {
  it('reads a --flag=value from argv', () => {
    expect(argValue('aerogap-mode', ['node', 'main.cjs', '--aerogap-mode=desktop'])).toBe('desktop');
  });

  it('returns null when absent', () => {
    expect(argValue('aerogap-mode', ['node', 'main.cjs'])).toBeNull();
  });
});

describe('resolveMode', () => {
  it('defaults to server when nothing is set', () => {
    expect(resolveMode(join(tmpdir(), 'missing'), { argv: [], env: {} })).toBe('server');
  });

  it('honours the CLI override', () => {
    expect(
      resolveMode(join(tmpdir(), 'missing'), {
        argv: ['--aerogap-mode=desktop'],
        env: {},
      }),
    ).toBe('desktop');
  });

  it('reads the install marker when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aerogap-mode-'));
    try {
      writeFileSync(join(dir, 'aerogap-mode.txt'), 'desktop\n', 'utf8');
      expect(resolveMode(dir, { argv: [], env: {} })).toBe('desktop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveServerUrl', () => {
  it('prefers --aerogap-url', () => {
    expect(
      resolveServerUrl({
        argv: ['--aerogap-url=http://localhost:9999/'],
        env: {},
      }),
    ).toBe('http://localhost:9999');
  });

  it('falls back to the default', () => {
    expect(resolveServerUrl({ argv: [], env: {}, programData: join(tmpdir(), 'no-pd') })).toBe(
      DEFAULT_SERVER_URL,
    );
  });

  it('reads app-url.txt from ProgramData', () => {
    const pd = mkdtempSync(join(tmpdir(), 'aerogap-pd-'));
    try {
      mkdirSync(join(pd, 'AeroGap'), { recursive: true });
      writeFileSync(join(pd, 'AeroGap', 'app-url.txt'), 'https://shop.example:8443/\n', 'utf8');
      expect(resolveServerUrl({ argv: [], env: {}, programData: pd })).toBe('https://shop.example:8443');
    } finally {
      rmSync(pd, { recursive: true, force: true });
    }
  });
});

describe('isAppOrigin', () => {
  it('matches the local and hosted origins', () => {
    expect(isAppOrigin(new URL('http://127.0.0.1:19080/x'), ['http://127.0.0.1:19080', null])).toBe(
      true,
    );
    expect(
      isAppOrigin(new URL('https://www.aerogaptechnologies.com/splash'), [
        'http://127.0.0.1:19080',
        'https://www.aerogaptechnologies.com',
      ]),
    ).toBe(true);
    expect(isAppOrigin(new URL('https://evil.example/'), ['http://127.0.0.1:19080'])).toBe(false);
  });
});

describe('fileArgument', () => {
  it('finds a project or org bundle on the command line', () => {
    expect(fileArgument(['node', 'main.cjs', 'C:\\tmp\\job.aqp.json'])).toMatch(/job\.aqp\.json$/i);
    expect(fileArgument(['AeroGap.exe', '--aerogap-mode=desktop', 'org.aqo.json'])).toBe('org.aqo.json');
    expect(fileArgument(['node', 'main.cjs'])).toBeNull();
  });
});

describe('isSafeExternalUrl', () => {
  it('allows only http and https', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true);
    expect(isSafeExternalUrl('http://127.0.0.1:19080')).toBe(true);
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });
});
