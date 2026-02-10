import type { GoogleDriveConfig, GoogleDriveFile, GoogleAuthState, SharedRepositoryConfig } from '../types/googleDrive';
import type { Project, AgentKnowledgeBases } from '../types/project';
import { hashEmail } from './userStorage';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string; expires_in: number; error?: string }) => void;
          }): { requestAccessToken(opts?: { prompt?: string }): void };
          revoke(token: string, callback?: () => void): void;
        };
      };
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        ViewId: { DOCS: string };
        DocsView: new (viewId?: string) => GoogleDocsView;
        Action: { PICKED: string; CANCEL: string };
        Feature: { MULTISELECT_ENABLED: string };
      };
    };
    gapi?: {
      load(api: string, callback: () => void): void;
    };
  }
}

interface GooglePickerBuilder {
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  addView(view: GoogleDocsView): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setCallback(callback: (data: GooglePickerResponse) => void): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): GoogleDocsView;
}

interface GooglePickerResponse {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';
// drive.file scope: allows creating/editing files created by this app
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
].join(',');

const APP_FOLDER_NAME = 'Assessment Analyzer';
const GLOBAL_KB_FILENAME = 'agent-knowledge-bases.json';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export class GoogleDriveService {
  private config: GoogleDriveConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private scriptsLoaded = false;
  private appFolderId: string | null = null;
  private knowledgeBaseFileId: string | null = null;
  private sharedRepoConfig: SharedRepositoryConfig | null = null;
  private subfolderIds: { knowledgeBases: string | null; projects: string | null } = {
    knowledgeBases: null,
    projects: null,
  };

  constructor(config: GoogleDriveConfig) {
    this.config = config;
  }

  setSharedRepositoryConfig(config: SharedRepositoryConfig | null): void {
    this.sharedRepoConfig = config;
    // Clear cached folder IDs when switching modes
    this.appFolderId = null;
    this.knowledgeBaseFileId = null;
    this.subfolderIds = { knowledgeBases: null, projects: null };
  }

  getSharedRepositoryConfig(): SharedRepositoryConfig | null {
    return this.sharedRepoConfig;
  }

  isSharedMode(): boolean {
    return !!this.sharedRepoConfig?.enabled;
  }

  async validateSharedFolder(folderId: string): Promise<{ valid: boolean; error?: string; folderName?: string }> {
    try {
      const token = await this.ensureValidToken();
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,capabilities`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { valid: false, error: 'Folder not found. Check the folder ID and make sure it has been shared with you.' };
        }
        return { valid: false, error: `Failed to access folder: ${response.statusText}` };
      }

      const data = await response.json();

      if (data.mimeType !== 'application/vnd.google-apps.folder') {
        return { valid: false, error: 'The provided ID is not a folder.' };
      }

      if (!data.capabilities?.canEdit) {
        return { valid: false, error: 'You do not have edit access to this folder. Ask the owner to grant you Editor permissions.' };
      }

      return { valid: true, folderName: data.name };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Failed to validate folder' };
    }
  }

  async loadScripts(): Promise<void> {
    if (this.scriptsLoaded) return;
    await Promise.all([loadScript(GIS_SCRIPT_URL), loadScript(GAPI_SCRIPT_URL)]);

    // Load the picker API via gapi
    await new Promise<void>((resolve, reject) => {
      if (!window.gapi) {
        reject(new Error('Google API (gapi) failed to load'));
        return;
      }
      window.gapi.load('picker', () => resolve());
    });

    this.scriptsLoaded = true;
  }

  async signIn(): Promise<GoogleAuthState> {
    await this.loadScripts();

    if (!window.google) {
      throw new Error('Google Identity Services not loaded');
    }

    return new Promise((resolve, reject) => {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_SCOPE,
        callback: async (response) => {
          if (response.error) {
            reject(new Error(`Google auth error: ${response.error}`));
            return;
          }

          this.accessToken = response.access_token;
          this.tokenExpiry = Date.now() + response.expires_in * 1000;

          // Fetch user info
          try {
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${this.accessToken}` },
            });
            const data = await userInfo.json();
            const hash = data.email ? await hashEmail(data.email) : null;
            resolve({
              isSignedIn: true,
              userEmail: data.email || null,
              userName: data.name || null,
              userPicture: data.picture || null,
              userHash: hash,
            });
          } catch {
            resolve({
              isSignedIn: true,
              userEmail: null,
              userName: null,
              userPicture: null,
              userHash: null,
            });
          }
        },
      });

      tokenClient.requestAccessToken();
    });
  }

  signOut(): void {
    if (this.accessToken && window.google) {
      window.google.accounts.oauth2.revoke(this.accessToken);
    }
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.appFolderId = null;
  }

  isSignedIn(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  getAccessToken(): string | null {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) return null;
    return this.accessToken;
  }

  async silentSignIn(): Promise<GoogleAuthState | null> {
    await this.loadScripts();

    if (!window.google) return null;

    return new Promise((resolve) => {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_SCOPE,
        callback: async (response) => {
          if (response.error) {
            resolve(null);
            return;
          }

          this.accessToken = response.access_token;
          this.tokenExpiry = Date.now() + response.expires_in * 1000;

          try {
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${this.accessToken}` },
            });
            const data = await userInfo.json();
            const hash = data.email ? await hashEmail(data.email) : null;
            resolve({
              isSignedIn: true,
              userEmail: data.email || null,
              userName: data.name || null,
              userPicture: data.picture || null,
              userHash: hash,
            });
          } catch {
            resolve(null);
          }
        },
      });

      // prompt: '' tries to get a token without user interaction
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  async ensureValidToken(): Promise<string> {
    if (this.isSignedIn() && this.accessToken) {
      return this.accessToken;
    }
    // Try silent first, fall back to interactive
    const silentResult = await this.silentSignIn();
    if (silentResult?.isSignedIn && this.accessToken) {
      return this.accessToken;
    }
    const authState = await this.signIn();
    if (!authState.isSignedIn || !this.accessToken) {
      throw new Error('Failed to obtain valid access token');
    }
    return this.accessToken;
  }

  async openPicker(): Promise<GoogleDriveFile[]> {
    await this.loadScripts();
    const token = await this.ensureValidToken();

    if (!window.google?.picker) {
      throw new Error('Google Picker API not loaded');
    }

    return new Promise((resolve) => {
      const picker = window.google!.picker;
      const view = new picker.DocsView(picker.ViewId.DOCS);
      view.setMimeTypes(SUPPORTED_MIME_TYPES);

      const pickerBuilder = new picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(this.config.apiKey)
        .addView(view)
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: GooglePickerResponse) => {
          if (data.action === picker.Action.PICKED && data.docs) {
            const files: GoogleDriveFile[] = data.docs.map((doc) => ({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes || 0,
            }));
            resolve(files);
          } else if (data.action === picker.Action.CANCEL) {
            resolve([]);
          }
        });

      pickerBuilder.build().setVisible(true);
    });
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const token = await this.ensureValidToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  // --- Project persistence methods ---

  /**
   * Get or create the app folder in Google Drive.
   * In shared mode, returns the shared folder ID directly.
   */
  private async getOrCreateAppFolder(): Promise<string> {
    // In shared mode, use the configured shared folder directly
    if (this.sharedRepoConfig?.enabled) {
      this.appFolderId = this.sharedRepoConfig.folderId;
      return this.appFolderId;
    }

    if (this.appFolderId) return this.appFolderId;

    const token = await this.ensureValidToken();

    // Search for existing folder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      )}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchResponse.ok) {
      throw new Error(`Failed to search for app folder: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
      this.appFolderId = searchData.files[0].id;
      return this.appFolderId!;
    }

    // Create the folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create app folder: ${createResponse.statusText}`);
    }

    const folder = await createResponse.json();
    this.appFolderId = folder.id;
    return this.appFolderId!;
  }

  /**
   * Get or create a subfolder inside a parent folder.
   * Used in shared mode to organize files into Knowledge-Bases/ and Projects/.
   */
  private async getOrCreateSubfolder(parentFolderId: string, folderName: string): Promise<string> {
    const token = await this.ensureValidToken();

    // Search for existing subfolder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      )}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchResponse.ok) {
      throw new Error(`Failed to search for subfolder '${folderName}': ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // Create the subfolder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        parents: [parentFolderId],
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create subfolder '${folderName}': ${createResponse.statusText}`);
    }

    const folder = await createResponse.json();
    return folder.id;
  }

  /**
   * Get the folder ID for projects — in shared mode uses Projects/ subfolder.
   */
  private async getProjectsFolderId(): Promise<string> {
    const rootFolderId = await this.getOrCreateAppFolder();
    if (!this.sharedRepoConfig?.enabled) return rootFolderId;

    if (this.subfolderIds.projects) return this.subfolderIds.projects;
    this.subfolderIds.projects = await this.getOrCreateSubfolder(rootFolderId, 'Projects');
    return this.subfolderIds.projects;
  }

  /**
   * Get the folder ID for knowledge bases — in shared mode uses Knowledge-Bases/ subfolder.
   */
  private async getKnowledgeBasesFolderId(): Promise<string> {
    const rootFolderId = await this.getOrCreateAppFolder();
    if (!this.sharedRepoConfig?.enabled) return rootFolderId;

    if (this.subfolderIds.knowledgeBases) return this.subfolderIds.knowledgeBases;
    this.subfolderIds.knowledgeBases = await this.getOrCreateSubfolder(rootFolderId, 'Knowledge-Bases');
    return this.subfolderIds.knowledgeBases;
  }

  /**
   * Save a project to Google Drive as a JSON file
   * Creates a new file or updates an existing one
   */
  async saveProjectFile(project: Project): Promise<string> {
    const token = await this.ensureValidToken();
    const folderId = await this.getProjectsFolderId();

    const fileName = `${project.name.replace(/[^a-zA-Z0-9 ]/g, '')}.aqp.json`;
    const projectJson = JSON.stringify(project, null, 2);

    if (project.driveFileId) {
      // Update existing file
      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${project.driveFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: projectJson,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update project file: ${response.statusText}`);
      }

      return project.driveFileId;
    } else {
      // Create new file with multipart upload
      const metadata = {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      };

      const boundary = '---ProjectUploadBoundary';
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${projectJson}\r\n` +
        `--${boundary}--`;

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create project file: ${response.statusText}`);
      }

      const file = await response.json();
      return file.id;
    }
  }

  /**
   * List all project files from the app folder in Google Drive
   */
  async listProjectFiles(): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
    const token = await this.ensureValidToken();
    const folderId = await this.getProjectsFolderId();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${folderId}' in parents and name contains '.aqp.json' and trashed=false`
      )}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to list project files: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  /**
   * Load a project from Google Drive by file ID
   */
  async loadProjectFile(fileId: string): Promise<Project> {
    const token = await this.ensureValidToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to load project file: ${response.statusText}`);
    }

    const project = await response.json() as Project;
    // Ensure the drive file ID is set
    project.driveFileId = fileId;
    return project;
  }

  /**
   * Delete a project file from Google Drive
   */
  async deleteProjectFile(fileId: string): Promise<void> {
    const token = await this.ensureValidToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete project file: ${response.statusText}`);
    }
  }

  // --- Global Agent Knowledge Base methods ---

  /**
   * Find the global knowledge base file in the app folder.
   * Caches the file ID after the first lookup.
   */
  private async findKnowledgeBaseFileId(): Promise<string | null> {
    if (this.knowledgeBaseFileId) return this.knowledgeBaseFileId;

    const token = await this.ensureValidToken();
    const folderId = await this.getKnowledgeBasesFolderId();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${folderId}' in parents and name='${GLOBAL_KB_FILENAME}' and trashed=false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to search for knowledge base file: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      this.knowledgeBaseFileId = data.files[0].id;
      return this.knowledgeBaseFileId;
    }
    return null;
  }

  /**
   * Load the global agent knowledge bases from Google Drive.
   * Returns empty object if the file doesn't exist yet.
   */
  async loadGlobalKnowledgeBases(): Promise<AgentKnowledgeBases> {
    const fileId = await this.findKnowledgeBaseFileId();
    if (!fileId) return {};

    const token = await this.ensureValidToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to load knowledge bases: ${response.statusText}`);
    }

    return (await response.json()) as AgentKnowledgeBases;
  }

  /**
   * Save global agent knowledge bases to Google Drive.
   * Creates the file if it doesn't exist, updates it otherwise.
   */
  async saveGlobalKnowledgeBases(data: AgentKnowledgeBases): Promise<string> {
    const token = await this.ensureValidToken();
    const fileId = await this.findKnowledgeBaseFileId();
    const jsonContent = JSON.stringify(data, null, 2);

    if (fileId) {
      // Update existing file
      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: jsonContent,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update knowledge bases: ${response.statusText}`);
      }

      return fileId;
    } else {
      // Create new file
      const kbFolderId = await this.getKnowledgeBasesFolderId();
      const metadata = {
        name: GLOBAL_KB_FILENAME,
        parents: [kbFolderId],
        mimeType: 'application/json',
      };

      const boundary = '---KBUploadBoundary';
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonContent}\r\n` +
        `--${boundary}--`;

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create knowledge bases file: ${response.statusText}`);
      }

      const file = await response.json();
      this.knowledgeBaseFileId = file.id;
      return file.id;
    }
  }
}
