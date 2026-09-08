/**
 * Linked-folder implementation of DriveIndexIO: the project's `<projectId>.aqv.json`
 * vector index lives INSIDE the linked manuals folder, at `.aerogap/<file>`, when
 * the folder is writable. On desktop, if the share is read-only, the same file
 * is written under the shell's userData/folder-index so this seat can still search.
 *
 * WHY THE FOLDER
 * The desktop product's promise is that manuals stay on the customer's disk or
 * file share. When the folder every seat links is the same mapped share
 * (\\fileserver\manuals), an index stored in it is automatically the same index
 * for every seat: one person clicks "Refresh search index", everyone searches.
 * No Google account, no cloud copy - the index holds vectors and character
 * offsets only (see driveVectorIndex.ts), never manual text.
 *
 * PERMISSIONS
 * Reading needs only the read grant the folder link already has. Writing asks
 * for read+write on the FSA handle (browser), or uses Node fs (desktop). Desktop
 * never blocks indexing on a read-only share — it falls back to a seat-local file.
 */
import type { DriveIndexIO } from './driveVectorIndex';
import {
  APP_FOLDER_NAME,
  ensureFolderIndexWritable,
  getDesktopFolderBridge,
  isLinkedFolder,
  type LinkedFolder,
} from './localFileAccess';

const README_NAME = 'README.txt';
const README_TEXT =
  'This folder is maintained by AeroGap.\n\n' +
  'It holds the search index for the manuals in the parent folder: numeric vectors and ' +
  'character offsets only - no manual text is stored here. Every AeroGap seat that links the ' +
  'parent folder shares this index.\n\n' +
  'Safe to delete: AeroGap rebuilds it the next time someone refreshes the search index.\n';

/** Error raised when the index cannot be written anywhere we can reach. */
export class FolderNotWritableError extends Error {
  constructor(detail?: string) {
    super(
      detail ??
        'AeroGap needs permission to save the search index. ' +
          'On the desktop app this should not happen — try Link manuals folder again. ' +
          'In Chrome/Edge, click "Refresh search index" (or "Allow write access") and approve when prompted.',
    );
    this.name = 'FolderNotWritableError';
  }
}

function isNotFound(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'NotFoundError' || err.name === 'TypeMismatchError';
  }
  const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
  if (code === 'ENOENT' || code === 'ENOTDIR') return true;
  return Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'NotFoundError');
}

function isWriteDenied(err: unknown): boolean {
  const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return true;
  if (err instanceof DOMException) {
    return err.name === 'NotAllowedError' || err.name === 'SecurityError';
  }
  return false;
}

/** Read a text file under `.aerogap/` via FSA, or null when absent. */
async function readAppFileFsa(root: FileSystemDirectoryHandle, fileName: string): Promise<string | null> {
  try {
    const dir = await root.getDirectoryHandle(APP_FOLDER_NAME);
    const file = await (await dir.getFileHandle(fileName)).getFile();
    return await file.text();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function writeAppFileFsa(dir: FileSystemDirectoryHandle, fileName: string, content: string): Promise<void> {
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

export type FolderIndexLocation = 'shared' | 'local';

/**
 * IO for one project's index file. Prefer the shared `.aerogap/` inside the
 * linked folder; on desktop fall back to seat-local userData when the share
 * is read-only.
 */
export function createFolderIndexIO(
  folder: LinkedFolder | FileSystemDirectoryHandle,
  fileName: string,
): DriveIndexIO & { lastWriteLocation?: () => FolderIndexLocation | null } {
  let lastWrite: FolderIndexLocation | null = null;

  const linked: LinkedFolder = isLinkedFolder(folder)
    ? folder
    : {
        kind: 'fsa',
        name: folder.name || 'manuals',
        handle: folder,
        id: `fsa:${folder.name || 'manuals'}`,
      };

  return {
    lastWriteLocation: () => lastWrite,
    async read(): Promise<string | null> {
      if (linked.kind === 'desktop') {
        const bridge = getDesktopFolderBridge();
        if (!bridge) return null;
        // Prefer shared index (other seats may have written it); else seat-local.
        const shared = await bridge.readAppFile(fileName);
        if (shared !== null) return shared;
        return bridge.readLocalIndex(fileName);
      }
      return readAppFileFsa(linked.handle, fileName);
    },
    async write(content: string): Promise<void> {
      if (linked.kind === 'desktop') {
        const bridge = getDesktopFolderBridge();
        if (!bridge) throw new FolderNotWritableError('Desktop folder bridge unavailable.');
        const canShared = await bridge.canWriteAppFolder();
        if (canShared) {
          try {
            if ((await bridge.readAppFile(README_NAME)) === null) {
              try {
                await bridge.writeAppFile(README_NAME, README_TEXT);
              } catch {
                /* cosmetic */
              }
            }
            await bridge.writeAppFile(fileName, content);
            lastWrite = 'shared';
            return;
          } catch (err) {
            if (!isWriteDenied(err)) {
              const msg = err instanceof Error ? err.message : String(err);
              // Fall through to local if it looks like a permission problem.
              if (!/EACCES|EPERM|EROFS|read-only|permission/i.test(msg)) {
                throw new FolderNotWritableError(
                  `Could not write the search index into the linked folder (${msg}).`,
                );
              }
            }
          }
        }
        try {
          await bridge.writeLocalIndex(fileName, content);
          lastWrite = 'local';
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new FolderNotWritableError(
            `Could not save the search index on this PC (${msg}).`,
          );
        }
      }

      // Browser FSA path
      if (!(await ensureFolderIndexWritable(linked))) throw new FolderNotWritableError();
      const dir = await linked.handle.getDirectoryHandle(APP_FOLDER_NAME, { create: true });
      if ((await readAppFileFsa(linked.handle, README_NAME)) === null) {
        try {
          await writeAppFileFsa(dir, README_NAME, README_TEXT);
        } catch {
          /* cosmetic */
        }
      }
      try {
        await writeAppFileFsa(dir, fileName, content);
        lastWrite = 'shared';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new FolderNotWritableError(
          `Could not write the search index into the linked folder (${msg}). ` +
            'Check that the folder is not read-only, then click Refresh search index again (or re-link the folder with write access).',
        );
      }
    },
  };
}

/** Does an index file exist (shared or seat-local)? Read-only; never prompts. */
export async function folderIndexExists(
  folder: LinkedFolder | FileSystemDirectoryHandle,
  fileName: string,
): Promise<boolean> {
  const io = createFolderIndexIO(folder, fileName);
  return (await io.read()) !== null;
}
