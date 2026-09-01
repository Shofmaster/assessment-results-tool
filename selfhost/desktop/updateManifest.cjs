/**
 * Update manifest verification.
 *
 * WHAT THIS PROTECTS
 * An auto-updater downloads code and runs it as the logged-in user. On a
 * customer's machine that code holds their aviation maintenance records. If
 * this module can be tricked into accepting a manifest we did not sign, we have
 * shipped a remote-code-execution channel into every site that installed
 * AeroGap - and we would be the delivery mechanism.
 *
 * So TLS is not the security boundary here. TLS proves the bytes came from
 * whoever holds the certificate for our update host; it says nothing if that
 * host is compromised, misconfigured, or replaced by a CDN edge someone else
 * controls. The signature proves the bytes came from someone holding our
 * OFFLINE signing key, which is a much smaller thing to defend.
 *
 * THE SIGNING FORMAT, AND WHY IT IS SHAPED THIS WAY
 * A feed file looks like:
 *
 *     { "payload": "<the manifest, as a JSON STRING>", "signature": "<base64>" }
 *
 * The signature covers the exact bytes of `payload`. Storing the manifest as a
 * string rather than a nested object removes JSON canonicalization from the
 * threat model entirely: there is no key ordering, no whitespace normalisation
 * and no number formatting to disagree about between the signer and the
 * verifier. Whole classes of signature-bypass bug come from re-serializing a
 * parsed object and signing something subtly different from what was checked.
 *
 * This module does I/O-free verification only. Downloading and installing live
 * in updater.cjs, so the rules below can be tested exhaustively without a
 * network or a filesystem.
 */
const crypto = require('node:crypto');

/**
 * Our update-signing public key, in SPKI PEM form.
 *
 * The PRIVATE half never touches a build machine, a CI runner or this
 * repository: it signs manifests offline. Compiling the public half in is what
 * makes the check meaningful - a manifest is trusted because of who signed it,
 * not because of where it was fetched from.
 *
 * Empty until a signing key is generated. An empty key does NOT mean
 * "accept anything": verifyManifest refuses outright, so an unconfigured build
 * simply cannot auto-update. That is the correct failure direction.
 */
const UPDATE_PUBLIC_KEY_PEM = '';

/** Manifest shapes this build understands. Bump when the format changes. */
const SUPPORTED_SCHEMA_VERSION = 1;

/** Reasons a manifest can be refused. Stable strings - they get logged. */
const REJECT = {
  NO_KEY: 'no-signing-key-configured',
  MALFORMED: 'malformed-feed',
  BAD_SIGNATURE: 'signature-verification-failed',
  SCHEMA: 'unsupported-schema-version',
  CHANNEL: 'wrong-channel',
  DOWNGRADE: 'downgrade-refused',
  MISSING_FIELD: 'missing-required-field',
  BAD_ARTIFACT: 'invalid-artifact-descriptor',
  STALE: 'manifest-too-old',
};

/**
 * How old a signed manifest may be before it is refused.
 *
 * Without this, an attacker who can control what the app fetches could replay a
 * genuinely-signed OLD manifest forever, pinning a site to a version whose
 * vulnerabilities are public. The signature stays valid indefinitely; freshness
 * has to be enforced separately.
 */
const MAX_MANIFEST_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Compare dotted numeric versions. Returns -1, 0 or 1. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/**
 * Verify a feed and return the manifest it carries.
 *
 * @param {string|Buffer} feedText  raw bytes fetched from the update URL
 * @param {object} options
 * @param {string} options.currentVersion  version currently installed
 * @param {string} options.channel         channel this install follows
 * @param {string} [options.publicKeyPem]  override, for tests
 * @param {number} [options.now]           override, for tests
 * @param {boolean} [options.allowDowngrade] set only by an explicit operator action
 * @returns {{ok: true, manifest: object} | {ok: false, reason: string, detail?: string}}
 */
function verifyManifest(feedText, options) {
  const {
    currentVersion,
    channel,
    publicKeyPem = UPDATE_PUBLIC_KEY_PEM,
    now = Date.now(),
    allowDowngrade = false,
  } = options || {};

  // An unconfigured build must not update, rather than update unchecked.
  if (!publicKeyPem || !String(publicKeyPem).trim()) {
    return { ok: false, reason: REJECT.NO_KEY };
  }

  let feed;
  try {
    feed = JSON.parse(String(feedText));
  } catch (err) {
    return { ok: false, reason: REJECT.MALFORMED, detail: 'feed is not JSON' };
  }

  // `payload` must be a STRING. If a future change ever makes it an object, the
  // bytes that were signed and the bytes that get parsed stop being the same
  // thing, which is precisely the bug this format exists to prevent.
  if (typeof feed?.payload !== 'string' || typeof feed?.signature !== 'string') {
    return { ok: false, reason: REJECT.MALFORMED, detail: 'feed needs string payload and signature' };
  }

  // SIGNATURE FIRST. Nothing inside the payload is looked at, trusted, or even
  // parsed until we know who wrote it. Reading fields before verifying is how
  // parser bugs become pre-auth attack surface.
  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      null, // Ed25519 selects its own hash
      Buffer.from(feed.payload, 'utf8'),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(feed.signature, 'base64'),
    );
  } catch (err) {
    // A malformed key or signature is a failed verification, never a pass.
    return { ok: false, reason: REJECT.BAD_SIGNATURE, detail: String(err.message || err) };
  }
  if (!signatureValid) return { ok: false, reason: REJECT.BAD_SIGNATURE };

  let manifest;
  try {
    manifest = JSON.parse(feed.payload);
  } catch {
    return { ok: false, reason: REJECT.MALFORMED, detail: 'payload is not JSON' };
  }

  if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: REJECT.SCHEMA,
      detail: `manifest schemaVersion ${manifest.schemaVersion}, this build understands ${SUPPORTED_SCHEMA_VERSION}`,
    };
  }

  for (const field of ['version', 'channel', 'releasedAt', 'artifact']) {
    if (!manifest[field]) return { ok: false, reason: REJECT.MISSING_FIELD, detail: field };
  }

  // A manifest signed for the `early` ring must not install on a `stable` site
  // just because someone pointed it at the wrong URL.
  if (manifest.channel !== channel) {
    return { ok: false, reason: REJECT.CHANNEL, detail: `manifest is for "${manifest.channel}"` };
  }

  const released = Date.parse(manifest.releasedAt);
  if (Number.isNaN(released)) {
    return { ok: false, reason: REJECT.MISSING_FIELD, detail: 'releasedAt is not a date' };
  }
  if (now - released > MAX_MANIFEST_AGE_MS) {
    return { ok: false, reason: REJECT.STALE, detail: `released ${manifest.releasedAt}` };
  }

  const { url, sha256, sizeBytes } = manifest.artifact || {};
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    return { ok: false, reason: REJECT.BAD_ARTIFACT, detail: 'artifact url must be https' };
  }
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) {
    return { ok: false, reason: REJECT.BAD_ARTIFACT, detail: 'artifact sha256 must be 64 hex chars' };
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: REJECT.BAD_ARTIFACT, detail: 'artifact sizeBytes must be a positive integer' };
  }

  // Downgrade protection. A signed-but-old manifest is still authentic, so the
  // signature cannot catch this: an attacker who can choose WHICH of our real
  // manifests you receive would otherwise walk a site back to a version with
  // published vulnerabilities.
  if (!allowDowngrade && compareVersions(manifest.version, currentVersion) < 0) {
    return {
      ok: false,
      reason: REJECT.DOWNGRADE,
      detail: `manifest offers ${manifest.version}, installed is ${currentVersion}`,
    };
  }

  return { ok: true, manifest };
}

/**
 * True when a verified manifest is actually newer than what is installed.
 * Kept separate from verification: "authentic" and "worth installing" are
 * different questions, and conflating them makes both harder to test.
 */
function isNewer(manifest, currentVersion) {
  return compareVersions(manifest.version, currentVersion) > 0;
}

/**
 * Confirm downloaded bytes match the signed descriptor.
 *
 * The signature covers the manifest, not the payload - so without this check an
 * attacker who can serve the artifact URL substitutes their own installer while
 * the manifest still verifies perfectly. Size is checked too: it is free, and it
 * fails fast on a truncated download before hashing hundreds of megabytes.
 */
function verifyArtifact(bytes, artifact) {
  if (bytes.length !== artifact.sizeBytes) {
    return { ok: false, reason: 'size-mismatch', detail: `got ${bytes.length}, expected ${artifact.sizeBytes}` };
  }
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  // timingSafeEqual over the hex digests. Not strictly required for a public
  // hash comparison, but it costs nothing and removes the question.
  const expected = Buffer.from(String(artifact.sha256).toLowerCase(), 'utf8');
  const actual = Buffer.from(digest, 'utf8');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'hash-mismatch', detail: `sha256 ${digest}` };
  }
  return { ok: true };
}

module.exports = {
  verifyManifest,
  verifyArtifact,
  isNewer,
  compareVersions,
  REJECT,
  SUPPORTED_SCHEMA_VERSION,
  MAX_MANIFEST_AGE_MS,
  UPDATE_PUBLIC_KEY_PEM,
};
