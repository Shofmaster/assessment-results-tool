export type DocumentSource = 'local' | 'http-server';

export interface UploadedDocument {
  id: string;
  name: string;
  text?: string;
  path: string;
  source: DocumentSource;
  mimeType?: string;
  extractedAt: string;
  /** SHA-256 hex of original file bytes — identity key for the session text cache. */
  contentHash?: string;
  /** For `http-server` source: which configured documentSources row to fetch from. */
  documentSourceId?: string;
}
