/**
 * Update orchestration.
 *
 * Verification lives in updateManifest.cjs and is deliberately I/O-free. This
 * module does the parts that touch the network and the disk:
 *
 *     check -> download -> verify bytes -> hand off to the installer
 *
 * WHY IT HANDS OFF RATHER THAN SWAPPING FILES ITSELF
 * The obvious design is to unpack the new build over the install directory.
 * That means a process replacing the very files it is executing, while a Convex
 * backend holds its database open - and if it fails halfway there is no version
 * left to roll back to. The Inno installer already solves this: it stops what
 * is running, replaces atomically, and rolls back on failure. So the updater's
 * job ends at "here is a verified installer", and the installer does the rest.
 *
 * ORDERING THAT MATTERS
 * Bytes are verified BEFORE anything is executed, and the file is written with
 * a .partial suffix until it has been verified - so a truncated or substituted
 * download can never be launched, even if the process dies mid-check.
 */
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { verifyManifest, verifyArtifact, isNewer } = require('./updateManifest.cjs');

/** Refuse an artifact larger than this. A sane ceiling beats an OOM. */
const MAX_ARTIFACT_BYTES = 600 * 1024 * 1024;

/** Give up on a download that stalls. */
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Fetch the update feed and decide whether there is anything to do.
 *
 * Returns a discriminated result rather than throwing: "no update available"
 * and "the feed was forged" are both ordinary outcomes for a background check,
 * and neither should surface as an unhandled rejection in the main process.
 *
 * @param {object} options
 * @param {string} options.feedUrl
 * @param {string} options.currentVersion
 * @param {string} options.channel
 * @param {string} [options.publicKeyPem]
 * @param {typeof fetch} [options.fetchImpl]  injected for tests
 */
async function checkForUpdate(options) {
  const { feedUrl, currentVersion, channel, publicKeyPem, fetchImpl = fetch } = options;

  if (!feedUrl) return { status: 'not-configured' };

  let feedText;
  try {
    const response = await fetchImpl(feedUrl, { method: 'GET' });
    if (!response.ok) return { status: 'unreachable', detail: `HTTP ${response.status}` };
    feedText = await response.text();
  } catch (err) {
    // An update check must never be able to break the app. Offline is normal.
    return { status: 'unreachable', detail: String((err && err.message) || err) };
  }

  const verified = verifyManifest(feedText, { currentVersion, channel, publicKeyPem });
  if (!verified.ok) {
    // Loud: a rejected manifest is either our mistake or someone's attempt.
    console.error(`[aerogap] update manifest REJECTED (${verified.reason})`, verified.detail || '');
    return { status: 'rejected', reason: verified.reason, detail: verified.detail };
  }

  if (!isNewer(verified.manifest, currentVersion)) {
    return { status: 'up-to-date', manifest: verified.manifest };
  }

  return { status: 'available', manifest: verified.manifest };
}

/**
 * Download an artifact and verify it against its signed descriptor.
 *
 * Written to `<name>.partial` and only renamed once the hash matches, so a
 * half-written or substituted file is never in a position to be executed.
 */
async function downloadAndVerify(manifest, options) {
  const { downloadDir, fetchImpl = fetch, onProgress } = options || {};

  if (manifest.artifact.sizeBytes > MAX_ARTIFACT_BYTES) {
    return { ok: false, reason: 'artifact-too-large', detail: `${manifest.artifact.sizeBytes} bytes` };
  }

  fs.mkdirSync(downloadDir, { recursive: true });
  const finalPath = path.join(downloadDir, `AeroGapSetup-${manifest.version}.exe`);
  const partialPath = `${finalPath}.${randomUUID()}.partial`;

  let bytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(manifest.artifact.url, { signal: controller.signal });
    if (!response.ok) return { ok: false, reason: 'download-failed', detail: `HTTP ${response.status}` };

    const buffer = await response.arrayBuffer();
    bytes = Buffer.from(buffer);
    if (onProgress) onProgress(bytes.length, manifest.artifact.sizeBytes);
  } catch (err) {
    return { ok: false, reason: 'download-failed', detail: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }

  // THE CHECK THAT MATTERS. The signature covers the manifest, not these bytes,
  // so whoever serves the artifact URL could otherwise substitute any installer
  // they liked while the manifest still verified perfectly.
  const artifactOk = verifyArtifact(bytes, manifest.artifact);
  if (!artifactOk.ok) {
    console.error(`[aerogap] downloaded artifact REJECTED (${artifactOk.reason})`, artifactOk.detail || '');
    return { ok: false, reason: artifactOk.reason, detail: artifactOk.detail };
  }

  try {
    fs.writeFileSync(partialPath, bytes);
    // Rename only after verification: the path an installer is ever launched
    // from has, by construction, held verified bytes.
    fs.renameSync(partialPath, finalPath);
  } catch (err) {
    try {
      fs.unlinkSync(partialPath);
    } catch {
      /* nothing to clean up */
    }
    return { ok: false, reason: 'write-failed', detail: String((err && err.message) || err) };
  }

  return { ok: true, path: finalPath, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/**
 * Launch the verified installer and let it take over.
 *
 * `detached` + `unref` matter: the installer stops the very application that
 * spawned it, and a child tied to this process's lifetime would be killed
 * mid-upgrade, leaving a half-replaced install.
 *
 * The caller is expected to quit immediately afterwards. Inno's own
 * CloseApplications handles the shell, but quitting first is cleaner and lets
 * the supervisor stop the backend in the right order.
 */
function launchInstaller(installerPath, { silent = false } = {}) {
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Installer not found at ${installerPath}`);
  }

  // Not /VERYSILENT by default: an unattended in-place upgrade of a desktop app
  // that a user is looking at should still show progress. Silent is for a
  // managed fleet, where it is passed explicitly.
  const args = silent ? ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'] : ['/SILENT', '/NORESTART'];

  const child = spawn(installerPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  return child.pid;
}

/** Remove stale downloads so a failed update does not accumulate on disk. */
function cleanDownloads(downloadDir, keepVersion) {
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(downloadDir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (keepVersion && entry === `AeroGapSetup-${keepVersion}.exe`) continue;
    if (!/^AeroGapSetup-.*\.exe(\..*\.partial)?$/.test(entry)) continue;
    try {
      fs.unlinkSync(path.join(downloadDir, entry));
      removed += 1;
    } catch {
      // A file held open by a running installer is not an error worth raising.
    }
  }
  return removed;
}

module.exports = {
  checkForUpdate,
  downloadAndVerify,
  launchInstaller,
  cleanDownloads,
  MAX_ARTIFACT_BYTES,
};
