/**
 * Google Drive implementation of DriveIndexIO: reads/writes a single project's
 * `<projectId>.aqv.json` vector index file inside the app's Drive folder. The
 * file id is cached after the first lookup so repeated writes (incremental
 * re-index) don't re-search the folder each time.
 */
import type { GoogleDriveService } from './googleDrive';
import type { DriveIndexIO } from './driveVectorIndex';

const INDEX_MIME = 'application/json';

export function createDriveIndexIO(service: GoogleDriveService, fileName: string): DriveIndexIO {
  let fileId: string | null = null;

  async function resolveFileId(): Promise<string | null> {
    if (fileId) return fileId;
    const folderId = await service.ensureAppFolder();
    const existing = await service.findFileInFolder(folderId, fileName);
    fileId = existing?.id ?? null;
    return fileId;
  }

  return {
    async read(): Promise<string | null> {
      const id = await resolveFileId();
      if (!id) return null;
      const buf = await service.downloadFile(id);
      return new TextDecoder().decode(buf);
    },
    async write(content: string): Promise<void> {
      const id = await resolveFileId();
      if (id) {
        await service.updateTextFile(id, INDEX_MIME, content);
        return;
      }
      const folderId = await service.ensureAppFolder();
      fileId = await service.uploadTextFile(folderId, fileName, INDEX_MIME, content);
    },
  };
}
