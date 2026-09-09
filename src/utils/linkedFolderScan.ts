/**
 * Persist a fingerprint of the last successful linked-folder registration so
 * Library auto-register can skip when nothing on disk changed.
 *
 * Fingerprint is path + size only (sorted). Mtime is omitted so OneDrive /
 * network shares that bump timestamps do not retrigger a full re-link.
 */

const STORAGE_KEY = 'aerogap.linkedFolderScan.v1';

export type FolderScanFileMeta = {
  relativePath: string;
  size: number;
};

export type LinkedFolderScanSnapshot = {
  folderId: string;
  projectId: string;
  fingerprint: string;
  scannedAt: string;
};

function normalizePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Stable fingerprint of accepted files (path + size, sorted). */
export function folderScanFingerprint(files: FolderScanFileMeta[]): string {
  const lines = files
    .map((f) => {
      const path = normalizePath(f.relativePath);
      const size = Number.isFinite(f.size) ? Math.max(0, Math.trunc(f.size)) : 0;
      return `${path}\t${size}`;
    })
    .sort();
  return lines.join('\n');
}

export function shouldSkipFolderRescan(
  snapshot: LinkedFolderScanSnapshot | null | undefined,
  folderId: string,
  projectId: string,
  fingerprint: string,
): boolean {
  if (!snapshot) return false;
  return (
    snapshot.folderId === folderId &&
    snapshot.projectId === projectId &&
    snapshot.fingerprint === fingerprint
  );
}

function readStore(): Record<string, LinkedFolderScanSnapshot> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, LinkedFolderScanSnapshot>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, LinkedFolderScanSnapshot>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* private mode / quota */
  }
}

function snapshotKey(folderId: string, projectId: string): string {
  return `${folderId}\0${projectId}`;
}

export function readLinkedFolderScanSnapshot(
  folderId: string,
  projectId: string,
): LinkedFolderScanSnapshot | null {
  const row = readStore()[snapshotKey(folderId, projectId)];
  if (
    !row ||
    typeof row.folderId !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.fingerprint !== 'string'
  ) {
    return null;
  }
  return row;
}

export function writeLinkedFolderScanSnapshot(
  folderId: string,
  projectId: string,
  fingerprint: string,
): LinkedFolderScanSnapshot {
  const snapshot: LinkedFolderScanSnapshot = {
    folderId,
    projectId,
    fingerprint,
    scannedAt: new Date().toISOString(),
  };
  const store = readStore();
  store[snapshotKey(folderId, projectId)] = snapshot;
  writeStore(store);
  return snapshot;
}

export function clearLinkedFolderScanSnapshot(folderId: string, projectId: string): void {
  const store = readStore();
  delete store[snapshotKey(folderId, projectId)];
  writeStore(store);
}
