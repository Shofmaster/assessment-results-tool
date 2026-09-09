import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  folderScanFingerprint,
  shouldSkipFolderRescan,
  readLinkedFolderScanSnapshot,
  writeLinkedFolderScanSnapshot,
  clearLinkedFolderScanSnapshot,
  type LinkedFolderScanSnapshot,
} from './linkedFolderScan';

describe('folderScanFingerprint', () => {
  it('is stable for the same path/size set regardless of order', () => {
    const a = folderScanFingerprint([
      { relativePath: 'GV/AMM.pdf', size: 1200 },
      { relativePath: 'GV/IPC.pdf', size: 800 },
    ]);
    const b = folderScanFingerprint([
      { relativePath: 'GV/IPC.pdf', size: 800 },
      { relativePath: 'GV/AMM.pdf', size: 1200 },
    ]);
    expect(a).toBe(b);
  });

  it('ignores mtime-only differences by construction (path+size only)', () => {
    // Callers pass path+size; mtime is never part of the fingerprint.
    expect(
      folderScanFingerprint([{ relativePath: 'GV/AMM.pdf', size: 1200 }]),
    ).toBe(folderScanFingerprint([{ relativePath: 'GV/AMM.pdf', size: 1200 }]));
  });

  it('changes when size or path changes', () => {
    const base = folderScanFingerprint([{ relativePath: 'GV/AMM.pdf', size: 1200 }]);
    expect(folderScanFingerprint([{ relativePath: 'GV/AMM.pdf', size: 1201 }])).not.toBe(base);
    expect(folderScanFingerprint([{ relativePath: 'GV/AMM2.pdf', size: 1200 }])).not.toBe(base);
  });

  it('normalizes backslashes', () => {
    expect(folderScanFingerprint([{ relativePath: 'GV\\AMM.pdf', size: 10 }])).toBe(
      folderScanFingerprint([{ relativePath: 'GV/AMM.pdf', size: 10 }]),
    );
  });
});

describe('shouldSkipFolderRescan', () => {
  const snap = (over: Partial<LinkedFolderScanSnapshot> = {}): LinkedFolderScanSnapshot => ({
    folderId: 'C:\\manuals',
    projectId: 'proj_1',
    fingerprint: 'GV/AMM.pdf\t1200',
    scannedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('skips when folder, project, and fingerprint match', () => {
    expect(
      shouldSkipFolderRescan(snap(), 'C:\\manuals', 'proj_1', 'GV/AMM.pdf\t1200'),
    ).toBe(true);
  });

  it('does not skip when fingerprint, folder, or project differs', () => {
    expect(shouldSkipFolderRescan(null, 'C:\\manuals', 'proj_1', 'x')).toBe(false);
    expect(shouldSkipFolderRescan(snap(), 'D:\\other', 'proj_1', 'GV/AMM.pdf\t1200')).toBe(false);
    expect(shouldSkipFolderRescan(snap(), 'C:\\manuals', 'proj_2', 'GV/AMM.pdf\t1200')).toBe(false);
    expect(shouldSkipFolderRescan(snap(), 'C:\\manuals', 'proj_1', 'changed')).toBe(false);
  });
});

describe('linkedFolderScan localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips a snapshot', () => {
    writeLinkedFolderScanSnapshot('folder-a', 'proj_1', 'fp');
    const read = readLinkedFolderScanSnapshot('folder-a', 'proj_1');
    expect(read?.fingerprint).toBe('fp');
    expect(read?.folderId).toBe('folder-a');
    expect(read?.projectId).toBe('proj_1');
    clearLinkedFolderScanSnapshot('folder-a', 'proj_1');
    expect(readLinkedFolderScanSnapshot('folder-a', 'proj_1')).toBeNull();
  });
});
