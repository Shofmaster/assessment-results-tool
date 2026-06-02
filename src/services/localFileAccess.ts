/**
 * File System Access wrapper for referencing manuals on the customer's machine.
 * Covers local disk AND mapped network shares (a mounted SMB/NFS server is just a
 * directory the picker can target). Chromium-only — feature-detect before use.
 *
 * We persist only the FileSystemDirectoryHandle (a permission token, not file
 * content) in IndexedDB. File bytes are read transiently and never stored.
 */

const IDB_NAME = 'aviation-local-files';
const IDB_STORE = 'handles';
const DIR_HANDLE_KEY = 'manuals-dir';

type FsPermissionState = 'granted' | 'denied' | 'prompt';
interface FsHandleWithPermission {
  queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<FsPermissionState>;
  requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<FsPermissionState>;
}

export function isLocalFileAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Prompt the user to pick their manuals directory and persist the handle. */
export async function pickManualsDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isLocalFileAccessSupported()) {
    throw new Error('This browser does not support local folder access. Use Chrome or Edge.');
  }
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
  await idbSet(DIR_HANDLE_KEY, handle);
  return handle;
}

export async function getStoredManualsDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  return idbGet<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
}

/** Ensure read permission on a handle, requesting it if needed (must be user-gesture driven). */
export async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as FsHandleWithPermission;
  const opts = { mode: 'read' as const };
  if (h.queryPermission && (await h.queryPermission(opts)) === 'granted') return true;
  if (h.requestPermission && (await h.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** A file discovered while walking a linked directory, with its path relative to the directory root. */
export interface LocalDirectoryEntry {
  file: File;
  /** Forward-slash path relative to the linked directory root (no leading root-folder segment). */
  relativePath: string;
}

/** Recursively walk a directory handle, yielding every file with its root-relative path. */
export async function enumerateDirectory(
  handle: FileSystemDirectoryHandle,
  prefix = '',
): Promise<LocalDirectoryEntry[]> {
  const out: LocalDirectoryEntry[] = [];
  // The async-iterator on FileSystemDirectoryHandle is the standard enumeration API.
  for await (const [name, child] of (handle as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'directory') {
      out.push(...(await enumerateDirectory(child as FileSystemDirectoryHandle, relativePath)));
    } else {
      const file = await (child as FileSystemFileHandle).getFile();
      out.push({ file, relativePath });
    }
  }
  return out;
}

/**
 * Prompt for the manuals directory, persist the handle, and return every file in it
 * with a root-relative path. Used by the upload flow to register manufacturer-reference
 * documents (metadata only) that the resolver later re-reads via `readFileFromDirectory`.
 */
export async function pickAndEnumerateManualsDirectory(): Promise<{
  handle: FileSystemDirectoryHandle;
  entries: LocalDirectoryEntry[];
}> {
  const handle = await pickManualsDirectory();
  const entries = await enumerateDirectory(handle);
  return { handle, entries };
}

/**
 * Read a file from the manuals directory by relative path (forward-slash segments).
 * Throws on missing handle/permission/file — callers map to a recoverable re-link prompt.
 */
export async function readFileFromDirectory(
  handle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<ArrayBuffer> {
  const segments = relativePath.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.length === 0) throw new Error('Empty document path');

  let dir = handle;
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i]);
  }
  const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}
