import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign as cryptoSign, createHash, randomBytes } from 'node:crypto';

/**
 * The update channel is the highest-consequence code in this repository.
 *
 * It downloads code and runs it as the logged-in user on machines holding
 * aviation maintenance records. Every test here is written from the attacker's
 * side: given control of the update host, a stale-but-genuine manifest, or a
 * mismatched artifact, can anything be made to install?
 *
 * "It verified correctly in a happy-path test" is not evidence for this module.
 * An updater that fails OPEN is worse than having no updater at all.
 */
const require_ = createRequire(import.meta.url);
const { verifyManifest, verifyArtifact, isNewer, compareVersions, REJECT, MAX_MANIFEST_AGE_MS } =
  require_('../desktop/updateManifest.cjs');

/** Our signing key. The real private half lives offline and never reaches CI. */
const ours = generateKeyPairSync('ed25519');
const theirs = generateKeyPairSync('ed25519');

const PUBLIC_KEY = ours.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const ATTACKER_KEY = theirs.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    version: '0.5.0',
    channel: 'stable',
    releasedAt: new Date().toISOString(),
    artifact: {
      url: 'https://updates.example.com/AeroGapSetup-0.5.0.exe',
      sha256: 'a'.repeat(64),
      sizeBytes: 148_000_000,
    },
    ...overrides,
  };
}

/** Build a feed signed by `key`. */
function feed(body: Record<string, unknown>, key = ours.privateKey) {
  const payload = JSON.stringify(body);
  const signature = cryptoSign(null, Buffer.from(payload, 'utf8'), key).toString('base64');
  return JSON.stringify({ payload, signature });
}

const base = { currentVersion: '0.4.0', channel: 'stable', publicKeyPem: PUBLIC_KEY };

describe('a genuine manifest is accepted', () => {
  it('verifies and returns the manifest', () => {
    const result = verifyManifest(feed(manifest()), base);
    expect(result.ok).toBe(true);
    expect(result.manifest.version).toBe('0.5.0');
  });

  it('reports whether it is actually newer', () => {
    expect(isNewer(manifest(), '0.4.0')).toBe(true);
    expect(isNewer(manifest({ version: '0.4.0' }), '0.4.0')).toBe(false);
  });
});

describe('forgery and tampering', () => {
  it('rejects a payload edited after signing', () => {
    // The exact attack the signature exists to stop: take our real feed and
    // point the artifact at somewhere else.
    const genuine = JSON.parse(feed(manifest()));
    const tampered = JSON.parse(genuine.payload);
    tampered.artifact.url = 'https://evil.example.com/payload.exe';
    const forged = JSON.stringify({
      payload: JSON.stringify(tampered),
      signature: genuine.signature,
    });

    expect(verifyManifest(forged, base)).toMatchObject({ ok: false, reason: REJECT.BAD_SIGNATURE });
  });

  it('rejects a tampered signature', () => {
    const genuine = JSON.parse(feed(manifest()));
    const bytes = Buffer.from(genuine.signature, 'base64');
    bytes[0] ^= 0xff;
    const forged = JSON.stringify({ payload: genuine.payload, signature: bytes.toString('base64') });

    expect(verifyManifest(forged, base)).toMatchObject({ ok: false, reason: REJECT.BAD_SIGNATURE });
  });

  it('rejects a manifest signed by a different key', () => {
    // Someone who compromises the update HOST still cannot produce this.
    expect(verifyManifest(feed(manifest(), theirs.privateKey), base)).toMatchObject({
      ok: false,
      reason: REJECT.BAD_SIGNATURE,
    });
  });

  it('rejects when verified against the wrong public key', () => {
    expect(
      verifyManifest(feed(manifest()), { ...base, publicKeyPem: ATTACKER_KEY }),
    ).toMatchObject({ ok: false, reason: REJECT.BAD_SIGNATURE });
  });

  it.each([
    ['no signature at all', JSON.stringify({ payload: JSON.stringify(manifest()) })],
    ['empty signature', JSON.stringify({ payload: JSON.stringify(manifest()), signature: '' })],
    ['payload as an object, not a string', JSON.stringify({ payload: manifest(), signature: 'x' })],
    ['not JSON', 'definitely not json'],
    ['an empty document', ''],
    ['a bare array', '[]'],
  ])('rejects %s', (_label, raw) => {
    const result = verifyManifest(raw, base);
    expect(result.ok).toBe(false);
    expect([REJECT.MALFORMED, REJECT.BAD_SIGNATURE]).toContain(result.reason);
  });

  it('refuses to verify at all when no signing key is configured', () => {
    // An unconfigured build must not auto-update. It must NOT treat a missing
    // key as "skip the check" - that would make every unsigned build updatable
    // by anyone who can answer the URL.
    expect(verifyManifest(feed(manifest()), { ...base, publicKeyPem: '' })).toMatchObject({
      ok: false,
      reason: REJECT.NO_KEY,
    });
  });
});

describe('replay and downgrade', () => {
  it('refuses a genuinely-signed manifest offering an OLDER version', () => {
    // The signature cannot catch this: the manifest is authentic, it is simply
    // old. An attacker choosing WHICH real manifest you receive would otherwise
    // walk a site back to a build with published vulnerabilities.
    const result = verifyManifest(feed(manifest({ version: '0.2.0' })), base);
    expect(result).toMatchObject({ ok: false, reason: REJECT.DOWNGRADE });
  });

  it('allows a downgrade only when explicitly requested', () => {
    // Deliberate operator action - pinning a site back to a known-good build.
    const result = verifyManifest(feed(manifest({ version: '0.2.0' })), {
      ...base,
      allowDowngrade: true,
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a manifest older than the freshness window', () => {
    const old = new Date(Date.now() - MAX_MANIFEST_AGE_MS - 60_000).toISOString();
    expect(verifyManifest(feed(manifest({ releasedAt: old })), base)).toMatchObject({
      ok: false,
      reason: REJECT.STALE,
    });
  });

  it('accepts one inside the freshness window', () => {
    const recent = new Date(Date.now() - MAX_MANIFEST_AGE_MS + 60_000).toISOString();
    expect(verifyManifest(feed(manifest({ releasedAt: recent })), base).ok).toBe(true);
  });
});

describe('scope confusion', () => {
  it('refuses a manifest signed for a different channel', () => {
    // An `early` build must not land on a `stable` site because someone pointed
    // it at the wrong feed. The manifest is genuine; it is just not for us.
    expect(verifyManifest(feed(manifest({ channel: 'early' })), base)).toMatchObject({
      ok: false,
      reason: REJECT.CHANNEL,
    });
  });

  it('refuses an unknown schema version', () => {
    expect(verifyManifest(feed(manifest({ schemaVersion: 99 })), base)).toMatchObject({
      ok: false,
      reason: REJECT.SCHEMA,
    });
  });

  it.each(['version', 'channel', 'releasedAt', 'artifact'])('refuses a manifest missing %s', (field) => {
    const body = manifest();
    delete (body as Record<string, unknown>)[field];
    expect(verifyManifest(feed(body), base).ok).toBe(false);
  });
});

describe('artifact descriptor', () => {
  it.each([
    ['a non-https url', { url: 'http://updates.example.com/x.exe' }],
    ['a file:// url', { url: 'file:///C:/evil.exe' }],
    ['a short hash', { sha256: 'abc' }],
    ['a non-hex hash', { sha256: 'z'.repeat(64) }],
    ['a zero size', { sizeBytes: 0 }],
    ['a negative size', { sizeBytes: -1 }],
  ])('refuses %s', (_label, patch) => {
    const body = manifest({ artifact: { ...manifest().artifact, ...patch } });
    expect(verifyManifest(feed(body), base)).toMatchObject({ ok: false, reason: REJECT.BAD_ARTIFACT });
  });
});

describe('downloaded bytes must match the signed descriptor', () => {
  const bytes = randomBytes(2048);
  const good = {
    url: 'https://updates.example.com/x.exe',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };

  it('accepts bytes matching the manifest', () => {
    expect(verifyArtifact(bytes, good)).toMatchObject({ ok: true });
  });

  it('rejects substituted bytes of the SAME length', () => {
    // The signature covers the manifest, not the download. Without this check,
    // whoever serves the artifact URL swaps in their own installer while the
    // manifest still verifies perfectly.
    const evil = randomBytes(bytes.length);
    expect(verifyArtifact(evil, good)).toMatchObject({ ok: false, reason: 'hash-mismatch' });
  });

  it('rejects a truncated download before hashing it', () => {
    expect(verifyArtifact(bytes.subarray(0, 100), good)).toMatchObject({
      ok: false,
      reason: 'size-mismatch',
    });
  });

  it('is not fooled by an uppercase hash in the manifest', () => {
    expect(verifyArtifact(bytes, { ...good, sha256: good.sha256.toUpperCase() })).toMatchObject({
      ok: true,
    });
  });
});

describe('version comparison', () => {
  it.each([
    ['0.4.0', '0.5.0', -1],
    ['0.5.0', '0.4.0', 1],
    ['0.4.0', '0.4.0', 0],
    // Numeric, not lexicographic: '0.10.0' must beat '0.9.0'.
    ['0.9.0', '0.10.0', -1],
    ['1.0.0', '0.99.99', 1],
    ['0.4', '0.4.0', 0],
  ])('compares %s to %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
