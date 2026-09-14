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

const { verifyManifest, isNewer } = require('./updateManifest.cjs');

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
 * Streamed to `<name>.partial` with an incremental SHA-256 so a 600 MB
 * installer is never held entirely in memory. Renamed to the final path only
 * once size and hash match - a truncated or substituted download is deleted.
 */
async function downloadAndVerify(manifest, options) {
  const { downloadDir, fetchImpl = fetch, onProgress } = options || {};

  if (manifest.artifact.sizeBytes > MAX_ARTIFACT_BYTES) {
    return { ok: false, reason: 'artifact-too-large', detail: `${manifest.artifact.sizeBytes} bytes` };
  }

  fs.mkdirSync(downloadDir, { recursive: true });
  const finalPath = path.join(downloadDir, `AeroGapSetup-${manifest.version}.exe`);
  const partialPath = `${finalPath}.${randomUUID()}.partial`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let received = 0;
  const hash = createHash('sha256');

  try {
    const response = await fetchImpl(manifest.artifact.url, { signal: controller.signal });
    if (!response.ok) return { ok: false, reason: 'download-failed', detail: `HTTP ${response.status}` };

    const writeStream = fs.createWriteStream(partialPath);
    try {
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const buf = Buffer.from(value);
          received += buf.length;
          hash.update(buf);
          if (!writeStream.write(buf)) {
            await new Promise((r) => writeStream.once('drain', r));
          }
          if (onProgress) onProgress(received, manifest.artifact.sizeBytes);
          if (received > manifest.artifact.sizeBytes) {
            throw Object.assign(new Error('download exceeded declared size'), { code: 'size-overflow' });
          }
        }
      } else {
        // Test / polyfill Responses that only expose arrayBuffer().
        const buffer = Buffer.from(await response.arrayBuffer());
        received = buffer.length;
        hash.update(buffer);
        writeStream.write(buffer);
        if (onProgress) onProgress(received, manifest.artifact.sizeBytes);
      }
      await new Promise((resolve, reject) => {
        writeStream.end((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      try {
        writeStream.destroy();
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(partialPath);
      } catch {
        /* nothing */
      }
      if (err && err.code === 'size-overflow') {
        return { ok: false, reason: 'size-mismatch', detail: `received ${received}, expected ${manifest.artifact.sizeBytes}` };
      }
      return { ok: false, reason: 'download-failed', detail: String((err && err.message) || err) };
    }
  } catch (err) {
    try {
      fs.unlinkSync(partialPath);
    } catch {
      /* nothing */
    }
    return { ok: false, reason: 'download-failed', detail: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }

  if (received !== manifest.artifact.sizeBytes) {
    try {
      fs.unlinkSync(partialPath);
    } catch {
      /* nothing */
    }
    console.error('[aerogap] downloaded artifact REJECTED (size-mismatch)');
    return {
      ok: false,
      reason: 'size-mismatch',
      detail: `received ${received}, expected ${manifest.artifact.sizeBytes}`,
    };
  }

  const digest = hash.digest('hex');
  const expected = String(manifest.artifact.sha256 || '').toLowerCase();
  if (digest !== expected) {
    try {
      fs.unlinkSync(partialPath);
    } catch {
      /* nothing */
    }
    console.error('[aerogap] downloaded artifact REJECTED (hash-mismatch)');
    return { ok: false, reason: 'hash-mismatch', detail: `got ${digest}` };
  }

  try {
    fs.renameSync(partialPath, finalPath);
  } catch (err) {
    try {
      fs.unlinkSync(partialPath);
    } catch {
      /* nothing */
    }
    return { ok: false, reason: 'write-failed', detail: String((err && err.message) || err) };
  }

  return { ok: true, path: finalPath, sha256: digest };
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
