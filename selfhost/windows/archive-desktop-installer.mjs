#!/usr/bin/env node
/**
 * Keep prior AeroGap desktop installers available for a manual rollback.
 *
 * Inno Setup writes the compile to windows/Output/AeroGapSetup-Desktop-<version>.exe.
 * That folder is build output: compiling the same version again replaces that
 * one file, and emptying Output drops every older setup that was sitting beside
 * it. This tool copies each setup into a separate archive directory and never
 * deletes an archived installer or overwrites one whose bytes differ.
 *
 * A same-version rebuild with different bytes is stored next to the original:
 *
 *     AeroGapSetup-Desktop-0.6.7.exe
 *     AeroGapSetup-Desktop-0.6.8.exe                         first bytes kept
 *     AeroGapSetup-Desktop-0.6.8.20260929T144400Z.exe        later rebuild
 *
 * The plain versioned name stays the first copy that landed, which is the one
 * an operator reinstalls. manifest.json is an index of those files. It is
 * rewritten only to add or refresh entries.
 *
 *     node windows/archive-desktop-installer.mjs \
 *       --output-dir windows/Output \
 *       --archive-dir windows/installer-archive
 *
 *     node windows/archive-desktop-installer.mjs \
 *       --setup D:\drops\AeroGapSetup-Desktop-0.6.7.exe \
 *       --archive-dir windows/installer-archive
 *
 * Auto-update cannot roll a site backward. The signing key is not configured,
 * and a signed feed refuses an older manifest (downgrade-refused). Reinstall
 * the archived exe by hand. See selfhost/docs/DESKTOP-ROLLBACK.md.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Inno's OutputBaseFilename. Timestamped siblings do not match. */
export const SETUP_NAME =
  /^AeroGapSetup-Desktop-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.exe$/;

/** A later rebuild of the same version, stored beside the original. */
const SIBLING_NAME =
  /^AeroGapSetup-Desktop-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.(\d{8}T\d{6}Z(?:-\d+)?)\.exe$/;

const MANIFEST_NAME = 'manifest.json';

/**
 * @param {string} outputDir  Inno Output directory. Missing is not an error.
 * @param {string} archiveDir retention directory. Created if needed.
 * @param {{ now?: Date | string | number }} [options]
 */
export async function archiveOutputDir(outputDir, archiveDir, options = {}) {
  if (!existsSync(outputDir)) {
    return { archived: [], note: 'output directory does not exist' };
  }
  const names = readdirSync(outputDir)
    .filter((name) => SETUP_NAME.test(name))
    .sort();
  const archived = [];
  for (const name of names) {
    archived.push(await archiveSetupFile(join(outputDir, name), archiveDir, options));
  }
  return { archived, note: names.length === 0 ? 'no desktop setup exe in output' : undefined };
}

/**
 * Copy one setup exe into the archive without clobbering a different file.
 *
 * @param {string} setupPath
 * @param {string} archiveDir
 * @param {{ now?: Date | string | number }} [options]
 */
export async function archiveSetupFile(setupPath, archiveDir, options = {}) {
  const name = basename(setupPath);
  const match = SETUP_NAME.exec(name);
  if (!match) {
    throw new Error(
      `Refusing to archive "${name}". Expected AeroGapSetup-Desktop-<version>.exe`,
    );
  }
  if (!existsSync(setupPath)) {
    throw new Error(`Installer not found: ${setupPath}`);
  }

  const version = match[1];
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid archive timestamp: ${options.now}`);
  }
  mkdirSync(archiveDir, { recursive: true });

  const sha256 = await hashFile(setupPath);
  const sizeBytes = statSync(setupPath).size;
  const primaryName = `AeroGapSetup-Desktop-${version}.exe`;
  const primaryPath = join(archiveDir, primaryName);

  let storedAs = primaryName;
  let action = 'copied';

  if (!existsSync(primaryPath)) {
    copyFileSync(setupPath, primaryPath);
  } else {
    const existingHash = await hashFile(primaryPath);
    if (existingHash === sha256) {
      action = 'already-archived';
    } else {
      // The plain versioned name is the first copy operators reinstall. A later
      // compile must not replace it. If those different bytes were already
      // stored as a sibling, do not write another copy.
      const existingCopy = await findArchivedCopy(archiveDir, sha256);
      if (existingCopy) {
        storedAs = existingCopy;
        action = 'already-archived';
      } else {
        storedAs = uniqueSiblingName(archiveDir, version, now);
        copyFileSync(setupPath, join(archiveDir, storedAs));
        action = 'kept-previous';
      }
    }
  }

  const entry = {
    version,
    file: storedAs,
    sha256,
    sizeBytes,
    archivedAt: now.toISOString(),
    primary: storedAs === primaryName,
  };
  updateManifest(archiveDir, entry, action, now);
  return { action, ...entry };
}

async function findArchivedCopy(archiveDir, sha256) {
  if (!existsSync(archiveDir)) return '';
  for (const name of readdirSync(archiveDir).sort()) {
    if (!versionFromArchiveName(name)) continue;
    if ((await hashFile(join(archiveDir, name))) === sha256) return name;
  }
  return '';
}

function uniqueSiblingName(archiveDir, version, now) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  let candidate = `AeroGapSetup-Desktop-${version}.${stamp}.exe`;
  let n = 2;
  while (existsSync(join(archiveDir, candidate))) {
    candidate = `AeroGapSetup-Desktop-${version}.${stamp}-${n}.exe`;
    n += 1;
  }
  return candidate;
}

function versionFromArchiveName(name) {
  return SETUP_NAME.exec(name)?.[1] || SIBLING_NAME.exec(name)?.[1] || '';
}

function hashFileSync(filePath) {
  const hash = createHash('sha256');
  const fd = openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let bytes = 0;
    do {
      bytes = readSync(fd, buf, 0, buf.length, null);
      if (bytes > 0) hash.update(buf.subarray(0, bytes));
    } while (bytes > 0);
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Add or refresh one index entry. Existing entries are kept, including ones
 * whose files this run did not touch. A corrupt index is moved aside and
 * rebuilt from the exe files still in the archive, so a bad json file cannot
 * be the reason an older installer disappears from the index.
 */
function updateManifest(archiveDir, entry, action, now) {
  const manifestPath = join(archiveDir, MANIFEST_NAME);
  let installers = [];

  if (existsSync(manifestPath)) {
    const text = readFileSync(manifestPath, 'utf8');
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.installers)) {
        throw new Error('installers array missing');
      }
      installers = parsed.installers.filter((item) => item && typeof item.file === 'string');
    } catch {
      const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      let broken = join(archiveDir, `manifest.json.broken-${stamp}`);
      let n = 2;
      while (existsSync(broken)) {
        broken = join(archiveDir, `manifest.json.broken-${stamp}-${n}`);
        n += 1;
      }
      renameSync(manifestPath, broken);
      installers = recoverEntries(archiveDir, now);
    }
  }

  if (action === 'already-archived') {
    const existing = installers.find((item) => item.file === entry.file && item.sha256 === entry.sha256);
    if (existing) {
      existing.lastSeenAt = entry.archivedAt;
    } else {
      installers.push(entry);
    }
  } else if (!installers.some((item) => item.file === entry.file && item.sha256 === entry.sha256)) {
    installers.push(entry);
  }

  installers.sort((a, b) => {
    const byVersion = String(a.version).localeCompare(String(b.version), undefined, { numeric: true });
    if (byVersion !== 0) return byVersion;
    return String(a.file).localeCompare(String(b.file));
  });

  const doc = {
    schemaVersion: 1,
    installers,
  };
  writeFileSync(manifestPath, `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

function recoverEntries(archiveDir, now) {
  const recovered = [];
  for (const name of readdirSync(archiveDir)) {
    const version = versionFromArchiveName(name);
    if (!version) continue;
    const filePath = join(archiveDir, name);
    const sha256 = hashFileSync(filePath);
    recovered.push({
      version,
      file: name,
      sha256,
      sizeBytes: statSync(filePath).size,
      archivedAt: statSync(filePath).mtime.toISOString(),
      primary: name === `AeroGapSetup-Desktop-${version}.exe`,
      recoveredAt: now.toISOString(),
    });
  }
  return recovered;
}

function parseArgs(argv) {
  const out = { outputDir: '', archiveDir: '', setup: '', help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--output-dir') out.outputDir = argv[++i] || '';
    else if (arg === '--archive-dir') out.archiveDir = argv[++i] || '';
    else if (arg === '--setup') out.setup = argv[++i] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  node archive-desktop-installer.mjs --output-dir <Inno Output> --archive-dir <retention dir>',
      '  node archive-desktop-installer.mjs --setup <AeroGapSetup-Desktop-version.exe> --archive-dir <retention dir>',
      '',
      'Copies desktop setup exes into the archive. Never deletes an archived',
      'installer and never overwrites one whose bytes differ.',
      '',
    ].join('\n'),
  );
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.archiveDir) throw new Error('--archive-dir is required');
  if (!args.outputDir && !args.setup) {
    throw new Error('Pass --output-dir, --setup, or both');
  }

  const results = [];
  if (args.setup) results.push(await archiveSetupFile(args.setup, args.archiveDir));
  if (args.outputDir) {
    const scanned = await archiveOutputDir(args.outputDir, args.archiveDir);
    if (scanned.note) process.stdout.write(`${scanned.note}\n`);
    results.push(...scanned.archived);
  }

  for (const result of results) {
    if (result.action === 'copied') {
      process.stdout.write(`archived ${result.file} sha256=${result.sha256}\n`);
    } else if (result.action === 'already-archived') {
      process.stdout.write(`already archived ${result.file}\n`);
    } else if (result.action === 'kept-previous') {
      process.stdout.write(
        `kept previous AeroGapSetup-Desktop-${result.version}.exe; stored different bytes as ${result.file}\n`,
      );
    }
  }
  process.stdout.write(`installer archive: ${args.archiveDir}\n`);
  return 0;
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`${err.message || err}\n`);
      process.exitCode = 1;
    },
  );
}
