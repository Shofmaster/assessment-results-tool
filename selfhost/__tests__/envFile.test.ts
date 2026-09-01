import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile, loadEnvFile } from '../server/src/envFile.js';

/**
 * This loader is what keeps ANTHROPIC_API_KEY and CLERK_SECRET_KEY out of the
 * WinSW service XML, which lives in Program Files and is readable by every
 * local account. If it silently no-ops, the install falls back to "no config"
 * rather than "insecure config" — but if precedence were inverted, a stale file
 * would override a deliberate environment override.
 */
describe('parseEnvFile', () => {
  it('parses simple assignments', () => {
    expect(parseEnvFile('A=1\nB=two')).toEqual({ A: '1', B: 'two' });
  });

  it('ignores comments and blank lines', () => {
    expect(parseEnvFile('# comment\n\nA=1\n   # indented\n')).toEqual({ A: '1' });
  });

  it('keeps "=" inside a value', () => {
    expect(parseEnvFile('URL=postgresql://u:p@h:5432?x=1')).toEqual({
      URL: 'postgresql://u:p@h:5432?x=1',
    });
  });

  it('strips matched surrounding quotes', () => {
    expect(parseEnvFile('A="quoted"\nB=\'single\'')).toEqual({ A: 'quoted', B: 'single' });
  });

  it('leaves unmatched quotes alone', () => {
    // A leading quote in a secret is far more likely real than a typo.
    expect(parseEnvFile('A="unbalanced')).toEqual({ A: '"unbalanced' });
  });

  it('handles CRLF line endings', () => {
    // The file is authored on Windows by an operator with Notepad.
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('skips lines with no "="', () => {
    expect(parseEnvFile('GARBAGE\nA=1')).toEqual({ A: '1' });
  });

  it('skips an empty key', () => {
    expect(parseEnvFile('=novalue\nA=1')).toEqual({ A: '1' });
  });
});

describe('loadEnvFile', () => {
  let dir: string;
  let saved: string | undefined;
  const touched: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'envfile-test-'));
    saved = process.env.AEROGAP_ENV_FILE;
    delete process.env.AEROGAP_ENV_FILE;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.AEROGAP_ENV_FILE;
    else process.env.AEROGAP_ENV_FILE = saved;
    for (const key of touched.splice(0)) delete process.env[key];
    rmSync(dir, { recursive: true, force: true });
  });

  function writeEnv(contents: string) {
    const path = join(dir, '.env');
    writeFileSync(path, contents);
    process.env.AEROGAP_ENV_FILE = path;
    return path;
  }

  it('is a no-op when AEROGAP_ENV_FILE is unset (the container path)', () => {
    const result = loadEnvFile();
    expect(result.loaded).toBe(false);
    expect(result.applied).toBe(0);
  });

  it('applies values from the file', () => {
    touched.push('ENVFILE_TEST_A');
    writeEnv('ENVFILE_TEST_A=from-file\n');
    const result = loadEnvFile();
    expect(result.loaded).toBe(true);
    expect(result.applied).toBe(1);
    expect(process.env.ENVFILE_TEST_A).toBe('from-file');
  });

  it('does NOT override an existing environment variable', () => {
    touched.push('ENVFILE_TEST_B');
    process.env.ENVFILE_TEST_B = 'from-environment';
    writeEnv('ENVFILE_TEST_B=from-file\n');
    loadEnvFile();
    // A real env var is a deliberate override — compose and shell runs must win.
    expect(process.env.ENVFILE_TEST_B).toBe('from-environment');
  });

  it('counts only the values it actually applied', () => {
    touched.push('ENVFILE_TEST_C', 'ENVFILE_TEST_D');
    process.env.ENVFILE_TEST_C = 'preset';
    writeEnv('ENVFILE_TEST_C=ignored\nENVFILE_TEST_D=applied\n');
    expect(loadEnvFile().applied).toBe(1);
  });

  it('throws when the configured file is missing', () => {
    process.env.AEROGAP_ENV_FILE = join(dir, 'does-not-exist.env');
    // Silently continuing would surface later as a confusing "APP_ORIGIN is not
    // set" instead of the real problem: a wrong or deleted config path.
    expect(() => loadEnvFile()).toThrow(/does not exist/i);
  });

  it('reports the path it loaded, for the startup banner', () => {
    const path = writeEnv('ENVFILE_TEST_E=1\n');
    touched.push('ENVFILE_TEST_E');
    expect(loadEnvFile().path).toBe(path);
  });
});
