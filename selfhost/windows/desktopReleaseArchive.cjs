/**
 * Versioned archive of AeroGap desktop installers.
 *
 * windows\Output is Inno Setup's compile drop. It is gitignored, it sits next
 * to the checkout (often inside OneDrive), and in practice only the setup exe
 * from the latest compile is still there. Older AeroGapSetup-Desktop-<version>
 * files disappear even though the filename contains the version. That folder
 * is not a release store.
 *
 * Auto-update is not a fallback either. UPDATE_PUBLIC_KEY_PEM is empty, so the
 * app refuses to apply a feed, and a signed feed refuses a downgrade unless an
 * operator explicitly allows it. Shipping a fix means handing out the setup
 * exe. Rolling back means running an older one.
 *
 * Each successful build keeps that exe here, once:
 *
 *     <archive>\<version>\AeroGapSetup-Desktop-<version>.exe
 *
 * Default <archive> is %LOCALAPPDATA%\AeroGapBuildCache\desktop-releases - the
 * same persistent cache build-staging.ps1 already uses, outside the repo and
 * outside windows\Output. Publishing a version replaces only that version.
 * Sibling versions, and any installer file already sitting in the archive, are
 * left alone. The setup exe is the artifact; it is not wrapped in a second zip.
 *
 * Operator rollback: quit AeroGap and run the archived
 * AeroGapSetup-Desktop-<version>.exe. See selfhost/docs/DESKTOP-ROLLBACK.md.
 */
const { createHash } = require('node:crypto');
const {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { join } = require('node:path');
const { pipeline } = require('node:stream/promises');

const INSTALLER_PREFIX = 'AeroGapSetup-Desktop-';

const ROLLBACK_NOTE =
  'To fall back, quit AeroGap and reinstall the archived AeroGapSetup-Desktop-<version>.exe. ' +
  'User data in %LOCALAPPDATA%\\AeroGap is kept. ' +
  'Help > Check for updates will not install an older build.';

/** x.y.z only. Anything else could escape the archive root when used as a path. */
function assertSafeVersion(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Refusing archive path for version ${JSON.stringify(version)}. Expected x.y.z.`,
    );
  }
}

function installerFileName(version) {
  assertSafeVersion(version);
  return `${INSTALLER_PREFIX}${version}.exe`;
}

/**
 * Where builds retain installers when -ReleaseArchive is omitted.
 * Empty when LOCALAPPDATA is unset (the caller must pass a directory).
 */
function defaultArchiveRoot(env = process.env) {
  const local = env && typeof env.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA.trim() : '';
  if (!local) return '';
  return join(local, 'AeroGapBuildCache', 'desktop-releases');
}

function emptyIndex() {
  return {
    product: 'AeroGap Desktop',
    layout: 1,
    rollback: ROLLBACK_NOTE,
    releases: [],
  };
}

function indexPath(archiveRoot) {
  return join(archiveRoot, 'index.json');
}

function readIndex(archiveRoot) {
  const path = indexPath(archiveRoot);
  if (!existsSync(path)) return emptyIndex();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(
      `Release index ${path} is not valid JSON. Installer files were left in place. ${err.message}`,
    );
  }
  if (!parsed || !Array.isArray(parsed.releases)) {
    throw new Error(
      `Release index ${path} has no releases array. Refusing to overwrite it.`,
    );
  }
  return parsed;
}

/** Same ordering as updateManifest.cjs. Newest-first in the index. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/**
 * Merge one release into an index. Same version + same sha256 keeps the
 * original archivedAt. A different sha256 replaces only that version's entry.
 * Every other version stays.
 */
function mergeIndex(existing, entry) {
  const releases = Array.isArray(existing && existing.releases)
    ? existing.releases.map((r) => ({ ...r }))
    : [];
  const idx = releases.findIndex((r) => r && r.version === entry.version);
  if (idx === -1) {
    releases.push({ ...entry });
  } else if (releases[idx].sha256 === entry.sha256) {
    releases[idx] = {
      ...releases[idx],
      file: entry.file,
      sizeBytes: entry.sizeBytes,
    };
  } else {
    releases[idx] = { ...entry };
  }
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return {
    product: 'AeroGap Desktop',
    layout: 1,
    rollback: ROLLBACK_NOTE,
    releases,
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function sameFile(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * Windows cannot rename onto an existing file. Move the previous exe aside,
 * put the new bytes in place, then delete the backup. A crash mid-swap leaves
 * either the new file or the .bak, never a truncated exe under the real name
 * without a backup next to it.
 */
function replaceFile(tmp, dest) {
  if (process.platform === 'win32' && existsSync(dest)) {
    const backup = `${dest}.bak`;
    if (existsSync(backup)) unlinkSync(backup);
    renameSync(dest, backup);
    try {
      renameSync(tmp, dest);
      unlinkSync(backup);
    } catch (err) {
      if (!existsSync(dest) && existsSync(backup)) renameSync(backup, dest);
      throw err;
    }
    return;
  }
  renameSync(tmp, dest);
}

async function copyAtomic(src, dest) {
  const tmp = `${dest}.${process.pid}.partial`;
  try {
    await pipeline(createReadStream(src), createWriteStream(tmp));
    replaceFile(tmp, dest);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* the original error is the one to surface */
      }
    }
    throw err;
  }
}

function writeIndexAtomic(archiveRoot, index) {
  mkdirSync(archiveRoot, { recursive: true });
  const dest = indexPath(archiveRoot);
  const tmp = join(archiveRoot, `.index.json.${process.pid}.partial`);
  writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  replaceFile(tmp, dest);
}

/**
 * Retain one installer. Copies into <archive>/<version>/ unless `installerPath`
 * is already that file (Inno wrote it there). Never deletes other versions.
 *
 * @returns {Promise<{action: 'added'|'replaced'|'unchanged', archivedPath: string, index: object}>}
 */
async function publishInstaller({ archiveRoot, version, installerPath, now = new Date() }) {
  assertSafeVersion(version);
  if (!archiveRoot || typeof archiveRoot !== 'string') {
    throw new Error('archiveRoot is required');
  }
  if (!installerPath || !existsSync(installerPath)) {
    throw new Error(`Installer not found: ${installerPath}`);
  }
  const size = statSync(installerPath).size;
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`Installer is empty: ${installerPath}`);
  }

  const fileName = installerFileName(version);
  const versionDir = join(archiveRoot, version);
  const dest = join(versionDir, fileName);
  mkdirSync(versionDir, { recursive: true });

  const incomingHash = await sha256File(installerPath);
  const indexBefore = readIndex(archiveRoot);
  const prior = (indexBefore.releases || []).find((r) => r && r.version === version);
  const alreadyThere = sameFile(installerPath, dest);

  let destHash = null;
  if (!alreadyThere && existsSync(dest)) destHash = await sha256File(dest);

  let action;
  if (prior && prior.sha256 === incomingHash && (alreadyThere || destHash === incomingHash)) {
    action = 'unchanged';
  } else if (prior) {
    action = 'replaced';
  } else {
    action = 'added';
  }

  if (!alreadyThere && action !== 'unchanged') {
    await copyAtomic(installerPath, dest);
    const written = await sha256File(dest);
    if (written !== incomingHash) {
      throw new Error(`Archived installer hash mismatch for ${version}`);
    }
  }

  const archivedAt =
    action === 'unchanged' && prior && prior.archivedAt ? prior.archivedAt : now.toISOString();

  const index = mergeIndex(indexBefore, {
    version,
    file: `${version}/${fileName}`,
    sha256: incomingHash,
    sizeBytes: size,
    archivedAt,
  });

  const beforeVersions = new Set((indexBefore.releases || []).map((r) => r.version));
  const afterVersions = new Set(index.releases.map((r) => r.version));
  for (const v of beforeVersions) {
    if (!afterVersions.has(v)) {
      throw new Error(`Refusing to write an index that drops archived version ${v}`);
    }
  }

  writeIndexAtomic(archiveRoot, index);
  return { action, archivedPath: dest, index: readIndex(archiveRoot) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

async function main(argv) {
  const cmd = argv[2];
  const args = parseArgs(argv.slice(3));
  if (cmd === 'publish') {
    if (!args.archive || !args.installer || !args.version) {
      throw new Error('publish requires --archive, --installer, and --version');
    }
    const result = await publishInstaller({
      archiveRoot: args.archive,
      installerPath: args.installer,
      version: args.version,
      now: args.now ? new Date(args.now) : new Date(),
    });
    process.stdout.write(
      `archived ${result.action}: ${result.archivedPath}\n` +
        `rollback: reinstall ${installerFileName(args.version)} from ${args.archive}\n`,
    );
    return;
  }
  if (cmd === 'list') {
    if (!args.archive) throw new Error('list requires --archive');
    const index = readIndex(args.archive);
    if (!index.releases.length) {
      process.stdout.write(`No archived desktop installers in ${args.archive}\n`);
      return;
    }
    for (const release of index.releases) {
      process.stdout.write(
        `${release.version}\t${join(args.archive, release.file)}\t${release.sha256}\n`,
      );
    }
    return;
  }
  throw new Error(
    'Usage: node desktopReleaseArchive.cjs publish --archive <dir> --installer <exe> --version <x.y.z>\n' +
      '       node desktopReleaseArchive.cjs list --archive <dir>',
  );
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}

module.exports = {
  INSTALLER_PREFIX,
  ROLLBACK_NOTE,
  assertSafeVersion,
  installerFileName,
  defaultArchiveRoot,
  readIndex,
  mergeIndex,
  publishInstaller,
  compareVersions,
};
