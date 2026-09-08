/**
 * Linked manuals folder access — desktop (Node fs via Electron) or browser
 * (File System Access API + IndexedDB).
 *
 * Desktop cannot keep Chromium FSA grants across restarts on Electron 33, so
 * the shell stores an absolute path and reads/writes through aerogapShell.folder.
 * Browser seats keep the FSA handle in IndexedDB.
 *
 * Public callers should prefer LinkedFolder helpers (getLinkedFolder,
 * enumerateLinkedMeta, readLinkedFile, etc.) rather than assuming a
 * FileSystemDirectoryHandle.
 */

const IDB_NAME = 'aviation-local-files';
const IDB_STORE = 'handles';
const DIR_HANDLE_KEY = 'manuals-dir';

/**
 * Sub-folder of the linked manuals folder where AeroGap keeps its own files -
 * today the shared search index (see folderIndexStorage.ts). Excluded from
 * enumeration so the index is never registered as a manual.
 */
export const APP_FOLDER_NAME = '.aerogap';

type FsPermissionState = 'granted' | 'denied' | 'prompt';
type FsPermissionMode = 'read' | 'readwrite';
interface FsHandleWithPermission {
  queryPermission?: (opts: { mode: FsPermissionMode }) => Promise<FsPermissionState>;
  requestPermission?: (opts: { mode: FsPermissionMode }) => Promise<FsPermissionState>;
}

/** Desktop shell bridge for native folder linking. */
export interface DesktopFolderBridge {
  pick: () => Promise<{ cancelled: true } | { cancelled: false; path: string; name: string }>;
  status: () => Promise<
    | { linked: false; missing?: boolean; path?: string }
    | { linked: true; path: string; name: string }
  >;
  listMeta: () => Promise<LocalFileMeta[]>;
  readFile: (relativePath: string) => Promise<ArrayBuffer>;
  readAppFile: (fileName: string) => Promise<string | null>;
  writeAppFile: (fileName: string, content: string) => Promise<boolean>;
  canWriteAppFolder: () => Promise<boolean>;
  readLocalIndex: (fileName: string) => Promise<string | null>;
  writeLocalIndex: (fileName: string, content: string) => Promise<boolean>;
  clear?: () => Promise<boolean>;
  onChanged?: (callback: (status: unknown) => void) => () => void;
}

export type LinkedFolder =
  | { kind: 'desktop'; name: string; path: string; id: string }
  | { kind: 'fsa'; name: string; handle: FileSystemDirectoryHandle; id: string };

function getDesktopFolderBridge(): DesktopFolderBridge | null {
  if (typeof window === 'undefined') return null;
  const shell = (window as unknown as { aerogapShell?: { folder?: DesktopFolderBridge } }).aerogapShell;
  const folder = shell?.folder;
  if (!folder || typeof folder.pick !== 'function' || typeof folder.status !== 'function') {
    return null;
  }
  return folder;
}

/** True when the desktop shell exposes native folder IPC. */
export function isDesktopFolderBridgeAvailable(): boolean {
  return getDesktopFolderBridge() !== null;
}

export function isLocalFileAccessSupported(): boolean {
  if (isDesktopFolderBridgeAvailable()) return true;
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

/**
 * Prompt the user to pick their manuals directory and persist the link.
 * Desktop: native dialog + path in userData. Browser: FSA handle in IndexedDB.
 */
export async function pickManualsDirectory(): Promise<FileSystemDirectoryHandle | LinkedFolder> {
  const bridge = getDesktopFolderBridge();
  if (bridge) {
    const result = await bridge.pick();
    if (result.cancelled) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }
    return { kind: 'desktop', name: result.name, path: result.path, id: result.path };
  }
  if (!isLocalFileAccessSupported()) {
    throw new Error('This browser does not support local folder access. Use Chrome or Edge.');
  }
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
    mode: 'readwrite',
  });
  await idbSet(DIR_HANDLE_KEY, handle);
  return handle;
}

/** @deprecated Prefer getLinkedFolder — FSA-only helper kept for older call sites. */
export async function getStoredManualsDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  const linked = await getLinkedFolder();
  if (!linked) return undefined;
  if (linked.kind === 'fsa') return linked.handle;
  // Desktop has no FileSystemDirectoryHandle; callers must use getLinkedFolder.
  return undefined;
}

/**
 * Currently linked manuals folder, if any and readable.
 */
export async function getLinkedFolder(): Promise<LinkedFolder | null> {
  const bridge = getDesktopFolderBridge();
  if (bridge) {
    const st = await bridge.status();
    if (!st.linked) return null;
    return { kind: 'desktop', name: st.name, path: st.path, id: st.path };
  }
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
    if (!handle) return null;
    return {
      kind: 'fsa',
      name: handle.name || 'manuals folder',
      handle,
      id: `fsa:${handle.name || 'manuals'}`,
    };
  } catch {
    return null;
  }
}

export type ManualsFolderAccess =
  | { status: 'none' }
  | { status: 'granted'; name: string; canWrite: boolean; indexLocation?: 'shared' | 'local' }
  | { status: 'needs-gesture'; name: string }
  | { status: 'denied'; name: string };

/**
 * Whether the stored manuals folder is readable right now. On desktop this is
 * always granted when a path is linked and still exists. Browser FSA may need a
 * gesture after reload (`needs-gesture`).
 */
export async function getManualsFolderAccess(): Promise<ManualsFolderAccess> {
  const bridge = getDesktopFolderBridge();
  if (bridge) {
    const st = await bridge.status();
    if (!st.linked) return { status: 'none' };
    const canShared = await bridge.canWriteAppFolder();
    // Desktop can always write a seat-local index under userData.
    return {
      status: 'granted',
      name: st.name,
      canWrite: true,
      indexLocation: canShared ? 'shared' : 'local',
    };
  }

  let handle: FileSystemDirectoryHandle | undefined;
  try {
    handle = await idbGet<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
  } catch {
    return { status: 'none' };
  }
  if (!handle) return { status: 'none' };
  const name = handle.name || 'manuals folder';
  if (await hasPermission(handle, 'read')) {
    return { status: 'granted', name, canWrite: await hasPermission(handle, 'readwrite') };
  }
  const h = handle as unknown as FsHandleWithPermission;
  let state: FsPermissionState = 'prompt';
  try {
    state = (await h.queryPermission?.({ mode: 'read' })) ?? 'prompt';
  } catch {
    state = 'prompt';
  }
  if (state === 'denied') return { status: 'denied', name };
  return { status: 'needs-gesture', name };
}

/**
 * Is `mode` access already granted? Never prompts. For desktop LinkedFolder,
 * always true when linked. For FSA, queries the handle.
 */
export async function hasPermission(
  folderOrHandle: LinkedFolder | FileSystemDirectoryHandle,
  mode: FsPermissionMode = 'read',
): Promise<boolean> {
  if (isLinkedFolder(folderOrHandle)) {
    if (folderOrHandle.kind === 'desktop') return true;
    return hasPermission(folderOrHandle.handle, mode);
  }
  const h = folderOrHandle as unknown as FsHandleWithPermission;
  if (!h.queryPermission) return true;
  try {
    return (await h.queryPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}

function isLinkedFolder(value: unknown): value is LinkedFolder {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'kind' in (value as object) &&
      ((value as LinkedFolder).kind === 'desktop' || (value as LinkedFolder).kind === 'fsa'),
  );
}

async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: FsPermissionMode,
): Promise<boolean> {
  if (await hasPermission(handle, mode)) return true;
  const h = handle as unknown as FsHandleWithPermission;
  if (!h.requestPermission) return false;
  try {
    return (await h.requestPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}

/** Ensure read permission (gesture-required for FSA). Desktop always true when linked. */
export async function ensureReadPermission(
  folderOrHandle: LinkedFolder | FileSystemDirectoryHandle,
): Promise<boolean> {
  if (isLinkedFolder(folderOrHandle)) {
    if (folderOrHandle.kind === 'desktop') return true;
    return ensurePermission(folderOrHandle.handle, 'read');
  }
  return ensurePermission(folderOrHandle, 'read');
}

export async function ensureWritePermission(
  folderOrHandle: LinkedFolder | FileSystemDirectoryHandle,
): Promise<boolean> {
  if (isLinkedFolder(folderOrHandle)) {
    if (folderOrHandle.kind === 'desktop') {
      // Shared `.aerogap` may be read-only; seat-local index still works.
      return true;
    }
    return ensurePermission(folderOrHandle.handle, 'readwrite');
  }
  return ensurePermission(folderOrHandle, 'readwrite');
}

/**
 * Ensure we can save a search index. Desktop: always true (shared `.aerogap`
 * or seat-local userData). Browser FSA: request write + create `.aerogap`.
 */
export async function ensureFolderIndexWritable(
  folderOrHandle?: LinkedFolder | FileSystemDirectoryHandle | null,
): Promise<boolean> {
  const folder = folderOrHandle
    ? isLinkedFolder(folderOrHandle)
      ? folderOrHandle
      : ({ kind: 'fsa', name: folderOrHandle.name, handle: folderOrHandle, id: `fsa:${folderOrHandle.name}` } as LinkedFolder)
    : await getLinkedFolder();
  if (!folder) return false;
  if (folder.kind === 'desktop') return true;
  if (!(await ensureWritePermission(folder.handle))) return false;
  try {
    await folder.handle.getDirectoryHandle(APP_FOLDER_NAME, { create: true });
    return true;
  } catch {
    return false;
  }
}

/** A file discovered while walking a linked directory, with its path relative to the directory root. */
export interface LocalDirectoryEntry {
  file: File;
  /** Forward-slash path relative to the linked directory root (no leading root-folder segment). */
  relativePath: string;
}

/**
 * Metadata-only discovery for fast folder linking. `getFile()` is used for
 * size/mtime/type only — never `arrayBuffer()`, so large manuals are not read
 * during registration.
 */
export interface LocalFileMeta {
  relativePath: string;
  name: string;
  size: number;
  lastModified: number;
  mimeType: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof DOMException
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

export async function enumerateDirectory(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  signal?: AbortSignal,
): Promise<LocalDirectoryEntry[]> {
  throwIfAborted(signal);
  const out: LocalDirectoryEntry[] = [];
  for await (const [name, child] of (handle as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    throwIfAborted(signal);
    if (name === APP_FOLDER_NAME) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'directory') {
      out.push(...(await enumerateDirectory(child as FileSystemDirectoryHandle, relativePath, signal)));
    } else {
      const file = await (child as FileSystemFileHandle).getFile();
      out.push({ file, relativePath });
    }
  }
  return out;
}

export async function enumerateDirectoryMeta(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  signal?: AbortSignal,
): Promise<LocalFileMeta[]> {
  throwIfAborted(signal);
  const out: LocalFileMeta[] = [];
  for await (const [name, child] of (handle as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    throwIfAborted(signal);
    if (name === APP_FOLDER_NAME) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'directory') {
      out.push(...(await enumerateDirectoryMeta(child as FileSystemDirectoryHandle, relativePath, signal)));
    } else {
      const file = await (child as FileSystemFileHandle).getFile();
      out.push({
        relativePath,
        name: file.name || name,
        size: file.size,
        lastModified: file.lastModified,
        mimeType: file.type || '',
      });
    }
  }
  return out;
}

/** Enumerate metadata from whatever folder is linked (desktop or FSA). */
export async function enumerateLinkedMeta(
  folder?: LinkedFolder | null,
  signal?: AbortSignal,
): Promise<LocalFileMeta[]> {
  throwIfAborted(signal);
  const linked = folder ?? (await getLinkedFolder());
  if (!linked) return [];
  if (linked.kind === 'desktop') {
    const bridge = getDesktopFolderBridge();
    if (!bridge) return [];
    const entries = await bridge.listMeta();
    throwIfAborted(signal);
    return entries;
  }
  return enumerateDirectoryMeta(linked.handle, '', signal);
}

export async function pickAndEnumerateManualsDirectory(
  signal?: AbortSignal,
): Promise<{
  handle: FileSystemDirectoryHandle;
  entries: LocalDirectoryEntry[];
}> {
  const picked = await pickManualsDirectory();
  if (isLinkedFolder(picked) && picked.kind === 'desktop') {
    throw new Error('Full-file enumeration is not available on desktop; use metadata linking.');
  }
  const handle = isLinkedFolder(picked) ? picked.handle : picked;
  const entries = await enumerateDirectory(handle, '', signal);
  return { handle, entries };
}

export async function pickAndEnumerateManualsDirectoryMeta(
  signal?: AbortSignal,
): Promise<{
  handle: FileSystemDirectoryHandle | LinkedFolder;
  entries: LocalFileMeta[];
}> {
  const picked = await pickManualsDirectory();
  if (isLinkedFolder(picked) && picked.kind === 'desktop') {
    const entries = await enumerateLinkedMeta(picked, signal);
    return { handle: picked, entries };
  }
  const handle = isLinkedFolder(picked) ? picked.handle : picked;
  const entries = await enumerateDirectoryMeta(handle, '', signal);
  return { handle, entries };
}

/**
 * Read a file from the manuals directory by relative path (forward-slash segments).
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

/** Read bytes for a relative path from the linked folder (desktop or FSA). */
export async function readLinkedFile(
  folderOrHandle: LinkedFolder | FileSystemDirectoryHandle,
  relativePath: string,
): Promise<ArrayBuffer> {
  if (isLinkedFolder(folderOrHandle)) {
    if (folderOrHandle.kind === 'desktop') {
      const bridge = getDesktopFolderBridge();
      if (!bridge) throw new Error('Desktop folder bridge unavailable');
      return bridge.readFile(relativePath);
    }
    return readFileFromDirectory(folderOrHandle.handle, relativePath);
  }
  return readFileFromDirectory(folderOrHandle, relativePath);
}

/** Subscribe to desktop folder-link changes (menu pick). No-op in browser. */
export function onDesktopFolderChanged(callback: () => void): () => void {
  const bridge = getDesktopFolderBridge();
  if (!bridge?.onChanged) return () => {};
  return bridge.onChanged(() => callback());
}

export { getDesktopFolderBridge, isLinkedFolder };
