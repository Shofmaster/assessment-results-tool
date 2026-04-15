export type DocumentSource = 'local';

export interface UploadedDocument {
  id: string;
  name: string;
  text?: string;
  path: string;
  source: DocumentSource;
  mimeType?: string;
  extractedAt: string;
}
