import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type ArchiveResult = {
  action: string;
  version: string;
  file: string;
  sha256: string;
  sizeBytes: number;
  archivedAt: string;
  primary: boolean;
};

type ArchiveOptions = { now?: string };

const require_ = createRequire(import.meta.url);
const { archiveOutputDir, archiveSetupFile } = require_(
  join(dirname(fileURLToPath(import.meta.url)), '../windows/archive-desktop-installer.mjs'),
) as {
  archiveOutputDir: (
    outputDir: string,
    archiveDir: string,
    options?: ArchiveOptions,
  ) => Promise<{ archived: ArchiveResult[]; note?: string }>;
  archiveSetupFile: (
    setupPath: string,
    archiveDir: string,
    options?: ArchiveOptions,
  ) => Promise<ArchiveResult>;
};

/**
 * The rollback copy has to survive the next build.
 *
 * windows/Output is Inno's compile directory: the same version compiled again
 * replaces AeroGapSetup-Desktop-<version>.exe, and emptying Output drops every
 * older setup that was sitting there. installer-archive is a different
 * directory, and nothing in this tool deletes or overwrites a file already
 * stored there when the bytes differ.
 */
const here = dirname(fileURLToPath(import.meta.url));
const windowsDir = join(here, '..', 'windows');
const script = join(windowsDir, 'archive-desktop-installer.mjs');
const NOW = '2026-09-29T14:44:00.000Z';
const LATER = '2026-09-29T15:00:00.000Z';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aerogap-archive-'));
  const output = join(root, 'Output');
  const archive = join(root, 'installer-archive');
  return { root, output, archive };
}

function writeSetup(dir: string, version: string, body: string) {
  mkdirSync(dir, { recursive: true });
  const name = `AeroGapSetup-Desktop-${version}.exe`;
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

describe('desktop installer archive', () => {
  it('keeps every version and does not overwrite a different rebuild', async () => {
    const { root, output, archive } = fixture();
    try {
      const older = writeSetup(output, '0.6.7', 'installer-0.6.7');
      const first = writeSetup(output, '0.6.8', 'installer-0.6.8-first');
      writeFileSync(join(output, 'notes.txt'), 'leave me');

      const firstPass = await archiveOutputDir(output, archive, { now: NOW });
      expect(firstPass.archived.map((item) => item.action).sort()).toEqual(['copied', 'copied']);
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.7.exe'), 'utf8')).toBe('installer-0.6.7');
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.8.exe'), 'utf8')).toBe('installer-0.6.8-first');

      const primary = join(archive, 'AeroGapSetup-Desktop-0.6.8.exe');
      const stamped = new Date('2020-01-01T00:00:00.000Z');
      utimesSync(primary, stamped, stamped);

      writeFileSync(first, 'installer-0.6.8-rebuild');
      const second = await archiveOutputDir(output, archive, { now: LATER });
      const rebuilt = second.archived.find((item) => item.version === '0.6.8');
      expect(rebuilt?.action).toBe('kept-previous');
      expect(rebuilt?.file).toBe('AeroGapSetup-Desktop-0.6.8.20260929T150000Z.exe');
      expect(readFileSync(primary, 'utf8')).toBe('installer-0.6.8-first');
      expect(statSync(primary).mtimeMs).toBe(stamped.getTime());
      expect(readFileSync(join(archive, rebuilt!.file), 'utf8')).toBe('installer-0.6.8-rebuild');
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.7.exe'), 'utf8')).toBe(
        readFileSync(older, 'utf8'),
      );

      const third = await archiveOutputDir(output, archive, { now: LATER });
      expect(third.archived.map((item) => item.action)).toEqual(['already-archived', 'already-archived']);
      expect(readdirSync(archive).filter((name) => name.endsWith('.exe')).sort()).toEqual([
        'AeroGapSetup-Desktop-0.6.7.exe',
        'AeroGapSetup-Desktop-0.6.8.20260929T150000Z.exe',
        'AeroGapSetup-Desktop-0.6.8.exe',
      ]);

      const manifest = JSON.parse(readFileSync(join(archive, 'manifest.json'), 'utf8'));
      const files = manifest.installers.map((item: { file: string }) => item.file);
      expect(files).toContain('AeroGapSetup-Desktop-0.6.7.exe');
      expect(files).toContain('AeroGapSetup-Desktop-0.6.8.exe');
      expect(files).toContain('AeroGapSetup-Desktop-0.6.8.20260929T150000Z.exe');
      expect(readdirSync(output)).toContain('notes.txt');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('stores a second same-second rebuild beside the first sibling', async () => {
    const { root, output, archive } = fixture();
    try {
      const setup = writeSetup(output, '0.6.8', 'a');
      await archiveSetupFile(setup, archive, { now: NOW });
      writeFileSync(setup, 'b');
      await archiveSetupFile(setup, archive, { now: NOW });
      writeFileSync(setup, 'c');
      const third = await archiveSetupFile(setup, archive, { now: NOW });
      expect(third.file).toBe('AeroGapSetup-Desktop-0.6.8.20260929T144400Z-2.exe');
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.8.exe'), 'utf8')).toBe('a');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rebuilds a corrupt manifest without dropping archived exes', async () => {
    const { root, output, archive } = fixture();
    try {
      writeSetup(output, '0.6.7', 'old');
      await archiveOutputDir(output, archive, { now: NOW });
      writeFileSync(join(archive, 'manifest.json'), '{');
      writeSetup(output, '0.6.8', 'new');
      await archiveOutputDir(output, archive, { now: LATER });
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.7.exe'), 'utf8')).toBe('old');
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.8.exe'), 'utf8')).toBe('new');
      const broken = readdirSync(archive).filter((name) => name.startsWith('manifest.json.broken-'));
      expect(broken).toEqual(['manifest.json.broken-20260929T150000Z']);
      const manifest = JSON.parse(readFileSync(join(archive, 'manifest.json'), 'utf8'));
      const files = manifest.installers.map((item: { file: string }) => item.file).sort();
      expect(files).toEqual(['AeroGapSetup-Desktop-0.6.7.exe', 'AeroGapSetup-Desktop-0.6.8.exe']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores a missing Output directory and refuses a misnamed file', async () => {
    const { root, archive } = fixture();
    try {
      const missing = await archiveOutputDir(join(root, 'no-such-output'), archive, { now: NOW });
      expect(missing.archived).toEqual([]);
      expect(missing.note).toMatch(/does not exist/);
      writeFileSync(join(root, 'AeroGapSetup.exe'), 'nope');
      await expect(archiveSetupFile(join(root, 'AeroGapSetup.exe'), archive)).rejects.toThrow(/Refusing to archive/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('CLI archives an Output directory and leaves prior bytes in place', () => {
    const { root, output, archive } = fixture();
    try {
      writeSetup(output, '0.6.8', 'first');
      execFileSync(process.execPath, [script, '--output-dir', output, '--archive-dir', archive], {
        encoding: 'utf8',
      });
      writeSetup(output, '0.6.8', 'second');
      const stdout = execFileSync(
        process.execPath,
        [script, '--output-dir', output, '--archive-dir', archive],
        { encoding: 'utf8' },
      );
      expect(stdout).toMatch(/kept previous AeroGapSetup-Desktop-0.6.8.exe/);
      expect(readFileSync(join(archive, 'AeroGapSetup-Desktop-0.6.8.exe'), 'utf8')).toBe('first');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('build-desktop.ps1 retains installers outside Output', () => {
  const ps1 = readFileSync(join(windowsDir, 'build-desktop.ps1'), 'utf8');

  it('archives before ISCC can replace a same-version exe, and again after', () => {
    const before = ps1.indexOf("Invoke-InstallerArchive 'before compile'");
    const compile = ps1.indexOf('& $iscc');
    const after = ps1.indexOf("Invoke-InstallerArchive 'after compile'");
    expect(before).toBeGreaterThan(-1);
    expect(compile).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(compile);
    expect(ps1).toMatch(/archive-desktop-installer\.mjs/);
    expect(ps1).toMatch(/installer-archive/);
  });

  it('does not delete the archive or the Output directory', () => {
    expect(ps1).toContain("Join-Path $here 'installer-archive'");
    expect(ps1).not.toMatch(/Remove-Item|Clear-Content|rmdir /);
  });
});
