export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface GoogleAuthState {
  isSignedIn: boolean;
  userEmail: string | null;
  userName: string | null;
  userPicture: string | null;
  userHash: string | null;
}

export type DocumentSource = 'local' | 'google-drive';

export interface UploadedDocument {
  id: string;
  name: string;
  text?: string;
  path: string;
  source: DocumentSource;
  mimeType?: string;
  extractedAt: string;
}

export interface SharedRepositoryConfig {
  enabled: boolean;
  folderId: string;
  folderName?: string;
  configuredAt?: string;
  fromEnv?: boolean;
}
