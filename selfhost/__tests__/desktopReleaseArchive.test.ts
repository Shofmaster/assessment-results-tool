import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The desktop fallback is "run an older AeroGapSetup-Desktop-<version>.exe".
 * That only works if publishing a new build cannot destroy the previous one.
 * windows\Output is the compile drop and is not the store these tests cover.
 */
const require_ = createRequire(import.meta.url);
const {
  publishInstaller,
  defaultArchiveRoot,
  readIndex,
  ROLLBACK_NOTE,
  installerFileName,
} = require_('../windows/desktopReleaseArchive.cjs');

const here = dirname(fileURLToPath(import.meta.url));
const buildDesktop = readFileSync(join(here, '..', 'windows', 'build-desktop.ps1'), 'utf8');

function tempArchive(): string {
  return mkdtempSync(join(tmpdir(), 'aerogap-rel-'));
}

function writeExe(dir: string, name: string, bytes: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

describe('publishInstaller retains every version', () => {
  it('adds a version and records the rollback note', async () => {
    const archive = tempArchive();
    try {
      const src = writeExe(join(archive, 'incoming'), 'setup.exe', 'installer-bytes-068');
      const now = new Date('2026-09-29T00:00:00.000Z');
      const result = await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: src,
        now,
      });
      expect(result.action).toBe('added');
      expect(result.archivedPath).toBe(
        join(archive, '0.6.8', 'AeroGapSetup-Desktop-0.6.8.exe'),
      );
      expect(readFileSync(result.archivedPath, 'utf8')).toBe('installer-bytes-068');
      const index = readIndex(archive);
      expect(index.rollback).toBe(ROLLBACK_NOTE);
      expect(index.releases).toEqual([
        expect.objectContaining({
          version: '0.6.8',
          file: '0.6.8/AeroGapSetup-Desktop-0.6.8.exe',
          sizeBytes: Buffer.byteLength('installer-bytes-068'),
          archivedAt: '2026-09-29T00:00:00.000Z',
        }),
      ]);
      expect(index.releases[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it('keeps an older version when a newer one is published', async () => {
    const archive = tempArchive();
    try {
      const older = writeExe(join(archive, 'src'), 'old.exe', 'version-067');
      await publishInstaller({
        archiveRoot: archive,
        version: '0.6.7',
        installerPath: older,
        now: new Date('2026-09-01T00:00:00.000Z'),
      });
      // A hand-copied installer that was never indexed must survive too.
      const strayDir = join(archive, '0.6.6');
      const stray = writeExe(strayDir, installerFileName('0.6.6'), 'hand-copied-066');

      const newer = writeExe(join(archive, 'src'), 'new.exe', 'version-068');
      const result = await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: newer,
        now: new Date('2026-09-29T00:00:00.000Z'),
      });

      expect(result.action).toBe('added');
      expect(readFileSync(join(archive, '0.6.7', installerFileName('0.6.7')), 'utf8')).toBe(
        'version-067',
      );
      expect(readFileSync(stray, 'utf8')).toBe('hand-copied-066');
      expect(readIndex(archive).releases.map((r: { version: string }) => r.version)).toEqual([
        '0.6.8',
        '0.6.7',
      ]);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it('does not churn archivedAt when the same bytes are published again', async () => {
    const archive = tempArchive();
    try {
      const src = writeExe(join(archive, 'src'), 'setup.exe', 'same-bytes');
      await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: src,
        now: new Date('2026-09-01T00:00:00.000Z'),
      });
      const again = await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: src,
        now: new Date('2026-09-29T00:00:00.000Z'),
      });
      expect(again.action).toBe('unchanged');
      expect(readIndex(archive).releases).toHaveLength(1);
      expect(readIndex(archive).releases[0].archivedAt).toBe('2026-09-01T00:00:00.000Z');
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it('replaces only the version whose bytes changed', async () => {
    const archive = tempArchive();
    try {
      await publishInstaller({
        archiveRoot: archive,
        version: '0.6.7',
        installerPath: writeExe(join(archive, 'src'), 'a.exe', 'stable-067'),
        now: new Date('2026-09-01T00:00:00.000Z'),
      });
      await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: writeExe(join(archive, 'src'), 'b.exe', 'first-068'),
        now: new Date('2026-09-02T00:00:00.000Z'),
      });
      const replaced = await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: writeExe(join(archive, 'src'), 'c.exe', 'second-068'),
        now: new Date('2026-09-29T00:00:00.000Z'),
      });
      expect(replaced.action).toBe('replaced');
      expect(readFileSync(join(archive, '0.6.8', installerFileName('0.6.8')), 'utf8')).toBe(
        'second-068',
      );
      expect(readFileSync(join(archive, '0.6.7', installerFileName('0.6.7')), 'utf8')).toBe(
        'stable-067',
      );
      const index = readIndex(archive);
      expect(index.releases.find((r: { version: string }) => r.version === '0.6.7').archivedAt).toBe(
        '2026-09-01T00:00:00.000Z',
      );
      expect(index.releases.find((r: { version: string }) => r.version === '0.6.8').archivedAt).toBe(
        '2026-09-29T00:00:00.000Z',
      );
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it('replaces the index when Inno overwrites that version in place', async () => {
    const archive = tempArchive();
    try {
      const dest = writeExe(join(archive, '0.6.8'), installerFileName('0.6.8'), 'first-pass');
      await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: dest,
        now: new Date('2026-09-01T00:00:00.000Z'),
      });
      writeFileSync(dest, 'second-pass');
      const result = await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: dest,
        now: new Date('2026-09-29T00:00:00.000Z'),
      });
      expect(result.action).toBe('replaced');
      expect(readFileSync(dest, 'utf8')).toBe('second-pass');
      expect(readIndex(archive).releases[0].archivedAt).toBe('2026-09-29T00:00:00.000Z');
      expect(readIndex(archive).releases[0].sizeBytes).toBe(Buffer.byteLength('second-pass'));
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it('records an installer Inno already wrote into the version directory', async () => {
    const archive = tempArchive();
    try {
      const dest = writeExe(
        join(archive, '0.6.8'),
        installerFileName('0.6.8'),
        'written-by-iscc',
      );
      const result = await publishInstaller({
        archiveRoot: archive,
        version: '0.6.8',
        installerPath: dest,
      });
      expect(result.action).toBe('added');
      expect(statSync(dest).size).toBe(Buffer.byteLength('written-by-iscc'));
      expect(readIndex(archive).releases).toHaveLength(1);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it.each(['../0.6.8', '0.6.8/evil', '0.6', '', 'v0.6.8', '0.6.8 '])(
    'rejects version %j',
    async (version) => {
      const archive = tempArchive();
      try {
        const src = writeExe(join(archive, 'src'), 'setup.exe', 'bytes');
        await expect(
          publishInstaller({ archiveRoot: archive, version, installerPath: src }),
        ).rejects.toThrow(/x\.y\.z/);
        expect(readIndex(archive).releases).toEqual([]);
      } finally {
        rmSync(archive, { recursive: true, force: true });
      }
    },
  );

  it('refuses an empty installer', async () => {
    const archive = tempArchive();
    try {
      const src = writeExe(join(archive, 'src'), 'setup.exe', '');
      await expect(
        publishInstaller({ archiveRoot: archive, version: '0.6.8', installerPath: src }),
      ).rejects.toThrow(/empty/);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite a corrupt index', async () => {
    const archive = tempArchive();
    try {
      writeFileSync(join(archive, 'index.json'), '{');
      const src = writeExe(join(archive, 'src'), 'setup.exe', 'bytes');
      await expect(
        publishInstaller({ archiveRoot: archive, version: '0.6.8', installerPath: src }),
      ).rejects.toThrow(/not valid JSON/);
      expect(readFileSync(join(archive, 'index.json'), 'utf8')).toBe('{');
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  });
});

describe('default archive location', () => {
  it('uses the persistent build cache under LOCALAPPDATA', () => {
    expect(defaultArchiveRoot({ LOCALAPPDATA: 'C:\\Users\\op\\AppData\\Local' })).toBe(
      join('C:\\Users\\op\\AppData\\Local', 'AeroGapBuildCache', 'desktop-releases'),
    );
  });

  it('does not invent a path when LOCALAPPDATA is missing', () => {
    expect(defaultArchiveRoot({})).toBe('');
  });

  it('tells the operator to reinstall a versioned setup exe', () => {
    expect(ROLLBACK_NOTE).toContain('AeroGapSetup-Desktop-<version>.exe');
    expect(ROLLBACK_NOTE).toContain('%LOCALAPPDATA%\\AeroGap');
    expect(ROLLBACK_NOTE).toContain('Check for updates');
  });
});

describe('build-desktop.ps1 publishes into the archive', () => {
  it('compiles into the versioned archive and mirrors only the latest exe into Output', () => {
    expect(buildDesktop).toMatch(/AeroGapBuildCache\\desktop-releases/);
    expect(buildDesktop).toMatch(/desktopReleaseArchive\.cjs/);
    expect(buildDesktop).toMatch(/\/O\$versionDir/);
    expect(buildDesktop).toMatch(/Copy-Item/);
    expect(buildDesktop).toContain('ROLLBACK.txt');
    expect(buildDesktop).toMatch(/must be x\.y\.z/);
  });

  it('does not delete the release archive or sibling versions', () => {
    expect(buildDesktop).not.toMatch(/Remove-Item/);
    expect(buildDesktop).toMatch(/inside windows\\Output/);
  });
});
