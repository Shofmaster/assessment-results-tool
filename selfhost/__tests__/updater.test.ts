import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, sign as cryptoSign, createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Orchestration around the verifier.
 *
 * The signature checks are proven in updateManifest.test.ts. What is tested
 * here is the part that touches disk and network - specifically, that nothing
 * unverified can ever end up at a path the app would execute, and that a failed
 * or hostile update degrades to "no update" rather than to a broken install.
 */
const require_ = createRequire(import.meta.url);
const { checkForUpdate, downloadAndVerify, cleanDownloads, MAX_ARTIFACT_BYTES } =
  require_('../desktop/updater.cjs');

const ours = generateKeyPairSync('ed25519');
const theirs = generateKeyPairSync('ed25519');
const PUBLIC_KEY = ours.publicKey.export({ type: 'spki', format: 'pem' }).toString();

const artifactBytes = randomBytes(4096);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    version: '0.5.0',
    channel: 'stable',
    releasedAt: new Date().toISOString(),
    artifact: {
      url: 'https://updates.example.com/AeroGapSetup-0.5.0.exe',
      sha256: createHash('sha256').update(artifactBytes).digest('hex'),
      sizeBytes: artifactBytes.length,
    },
    ...overrides,
  };
}

function feed(body: Record<string, unknown>, key = ours.privateKey) {
  const payload = JSON.stringify(body);
  return JSON.stringify({
    payload,
    signature: cryptoSign(null, Buffer.from(payload, 'utf8'), key).toString('base64'),
  });
}

const base = { currentVersion: '0.4.0', channel: 'stable', publicKeyPem: PUBLIC_KEY };

let downloadDir: string;

beforeEach(() => {
  downloadDir = mkdtempSync(join(tmpdir(), 'aerogap-upd-'));
});

afterEach(() => {
  rmSync(downloadDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('checking for an update', () => {
  const okFetch = (body: string) => vi.fn(async () => new Response(body, { status: 200 }));

  it('reports an available update', async () => {
    const result = await checkForUpdate({
      ...base,
      feedUrl: 'https://updates.example.com/stable.json',
      fetchImpl: okFetch(feed(manifest())),
    });
    expect(result).toMatchObject({ status: 'available' });
    expect(result.manifest.version).toBe('0.5.0');
  });

  it('reports up-to-date when the manifest matches the installed version', async () => {
    const result = await checkForUpdate({
      ...base,
      currentVersion: '0.5.0',
      feedUrl: 'https://updates.example.com/stable.json',
      fetchImpl: okFetch(feed(manifest())),
    });
    expect(result.status).toBe('up-to-date');
  });

  it('rejects a forged feed rather than offering it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await checkForUpdate({
      ...base,
      feedUrl: 'https://updates.example.com/stable.json',
      fetchImpl: okFetch(feed(manifest(), theirs.privateKey)),
    });
    expect(result.status).toBe('rejected');
  });

  it('treats being offline as ordinary, not as an error to throw', async () => {
    // A background update check must never be able to take down the app.
    const result = await checkForUpdate({
      ...base,
      feedUrl: 'https://updates.example.com/stable.json',
      fetchImpl: vi.fn(async () => { throw new Error('ENOTFOUND'); }),
    });
    expect(result.status).toBe('unreachable');
  });

  it('reports not-configured when no feed URL is set', async () => {
    const result = await checkForUpdate({ ...base, feedUrl: '' });
    expect(result.status).toBe('not-configured');
  });

  it.each([404, 500, 503])('treats HTTP %i as unreachable', async (status) => {
    const result = await checkForUpdate({
      ...base,
      feedUrl: 'https://updates.example.com/stable.json',
      fetchImpl: vi.fn(async () => new Response('', { status })),
    });
    expect(result.status).toBe('unreachable');
  });
});

describe('downloading', () => {
  const serve = (bytes: Buffer) =>
    vi.fn(async () => new Response(bytes, { status: 200 }));

  it('writes a verified artifact and returns its path', async () => {
    const result = await downloadAndVerify(manifest(), {
      downloadDir,
      fetchImpl: serve(artifactBytes),
    });
    expect(result.ok).toBe(true);
    expect(existsSync(result.path)).toBe(true);
  });

  it('REFUSES substituted bytes and leaves nothing executable behind', async () => {
    // The core attack on this path: the manifest is genuine, but whoever serves
    // the artifact URL returns a different installer. Nothing may survive.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const evil = randomBytes(artifactBytes.length);

    const result = await downloadAndVerify(manifest(), { downloadDir, fetchImpl: serve(evil) });

    expect(result).toMatchObject({ ok: false, reason: 'hash-mismatch' });
    // Not merely "not returned" - not present on disk at all, under any name.
    expect(readdirSync(downloadDir)).toEqual([]);
  });

  it('refuses a truncated download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await downloadAndVerify(manifest(), {
      downloadDir,
      fetchImpl: serve(artifactBytes.subarray(0, 100)),
    });
    expect(result).toMatchObject({ ok: false, reason: 'size-mismatch' });
    expect(readdirSync(downloadDir)).toEqual([]);
  });

  it('never leaves a .partial file behind on failure', async () => {
    // A .partial that survived could be picked up by later cleanup logic or, in
    // the worst case, renamed by a future refactor. It must simply not exist.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await downloadAndVerify(manifest(), {
      downloadDir,
      fetchImpl: serve(randomBytes(artifactBytes.length)),
    });
    expect(readdirSync(downloadDir).filter((f) => f.includes('partial'))).toEqual([]);
  });

  it('refuses an implausibly large artifact before downloading it', async () => {
    const fetchImpl = vi.fn();
    const result = await downloadAndVerify(
      manifest({ artifact: { ...manifest().artifact, sizeBytes: MAX_ARTIFACT_BYTES + 1 } }),
      { downloadDir, fetchImpl },
    );
    expect(result).toMatchObject({ ok: false, reason: 'artifact-too-large' });
    // Checked BEFORE the request: a declared 40 GB artifact should not be
    // fetched to discover it is too big.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('handles a download error without throwing', async () => {
    const result = await downloadAndVerify(manifest(), {
      downloadDir,
      fetchImpl: vi.fn(async () => { throw new Error('connection reset'); }),
    });
    expect(result).toMatchObject({ ok: false, reason: 'download-failed' });
  });
});

describe('cleaning up downloads', () => {
  it('removes stale installers but keeps the named version', () => {
    writeFileSync(join(downloadDir, 'AeroGapSetup-0.4.0.exe'), 'old');
    writeFileSync(join(downloadDir, 'AeroGapSetup-0.5.0.exe'), 'new');
    writeFileSync(join(downloadDir, 'AeroGapSetup-0.3.0.exe.abc.partial'), 'junk');

    expect(cleanDownloads(downloadDir, '0.5.0')).toBe(2);
    expect(readdirSync(downloadDir)).toEqual(['AeroGapSetup-0.5.0.exe']);
  });

  it('leaves unrelated files alone', () => {
    // It runs in a directory it does not exclusively own.
    writeFileSync(join(downloadDir, 'notes.txt'), 'x');
    cleanDownloads(downloadDir, null);
    expect(readdirSync(downloadDir)).toEqual(['notes.txt']);
  });

  it('does not throw on a missing directory', () => {
    expect(() => cleanDownloads(join(downloadDir, 'nope'), null)).not.toThrow();
  });
});
