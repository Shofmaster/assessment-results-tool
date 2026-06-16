export type DocumentSource = 'local' | 'http-server' | 'gdrive';

export interface UploadedDocument {
  id: string;
  name: string;
  text?: string;
  /**
   * For `local`/`http-server`: the file's path relative to the linked source root.
   * For `gdrive`: the Google Drive file ID (the resolver re-fetches bytes by this ID).
   */
  path: string;
  source: DocumentSource;
  mimeType?: string;
  extractedAt: string;
  /** SHA-256 hex of original file bytes — identity key for the session text cache. */
  contentHash?: string;
  /** For `http-server` source: which configured documentSources row to fetch from. */
  documentSourceId?: string;
}
