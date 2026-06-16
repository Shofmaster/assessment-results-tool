import type { GoogleDriveConfig, GoogleDriveFile, GoogleAuthState } from '../types/googleDrive';

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
        ViewId: { DOCS: string; FOLDERS: string };
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
  setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
  setIncludeFolders(include: boolean): GoogleDocsView;
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

  constructor(config: GoogleDriveConfig) {
    this.config = config;
  }

  async loadScripts(): Promise<void> {
    if (this.scriptsLoaded) return;
    await Promise.all([loadScript(GIS_SCRIPT_URL), loadScript(GAPI_SCRIPT_URL)]);

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

          try {
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${this.accessToken}` },
            });
            const data = await userInfo.json();
            resolve({
              isSignedIn: true,
              userEmail: data.email || null,
              userName: data.name || null,
              userPicture: data.picture || null,
              userHash: null,
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
            resolve({
              isSignedIn: true,
              userEmail: data.email || null,
              userName: data.name || null,
              userPicture: data.picture || null,
              userHash: null,
            });
          } catch {
            resolve(null);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  async ensureValidToken(): Promise<string> {
    if (this.isSignedIn() && this.accessToken) {
      return this.accessToken;
    }
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

  /** Prompt the user to pick a single Drive folder. Returns null if cancelled. */
  async pickFolder(): Promise<{ id: string; name: string } | null> {
    await this.loadScripts();
    const token = await this.ensureValidToken();

    if (!window.google?.picker) {
      throw new Error('Google Picker API not loaded');
    }

    return new Promise((resolve) => {
      const picker = window.google!.picker;
      // FOLDERS view with folder-selection enabled lets the user drill in and pick a folder.
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const pickerBuilder = new picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(this.config.apiKey)
        .addView(view)
        .setCallback((data: GooglePickerResponse) => {
          if (data.action === picker.Action.PICKED && data.docs && data.docs[0]) {
            const folder = data.docs[0];
            resolve({ id: folder.id, name: folder.name });
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null);
          }
        });

      pickerBuilder.build().setVisible(true);
    });
  }

  /**
   * Recursively list every supported file under a Drive folder, returning each with a
   * forward-slash path relative to the picked folder root. Folders themselves are
   * traversed but not returned. Uses drive.file access granted by picking the folder.
   */
  async enumerateFolder(folderId: string, prefix = ''): Promise<Array<{ file: GoogleDriveFile; relativePath: string }>> {
    const token = await this.ensureValidToken();
    const out: Array<{ file: GoogleDriveFile; relativePath: string }> = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to list folder contents: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as {
        nextPageToken?: string;
        files?: Array<{ id: string; name: string; mimeType: string; size?: string }>;
      };

      for (const item of data.files ?? []) {
        const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          out.push(...(await this.enumerateFolder(item.id, relativePath)));
        } else {
          out.push({
            file: { id: item.id, name: item.name, mimeType: item.mimeType, sizeBytes: Number(item.size ?? 0) },
            relativePath,
          });
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return out;
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
}

/**
 * Process-wide shared service so the manuals-reference flow (link UI) and the
 * document resolver re-use one signed-in instance — avoids redundant OAuth
 * prompts when reading linked Drive manuals on demand. Keyed by client id so a
 * settings change swaps the instance. Cleared on sign-out via `resetSharedDriveService`.
 */
let sharedDriveService: { key: string; service: GoogleDriveService } | null = null;

export function getSharedDriveService(config: GoogleDriveConfig): GoogleDriveService {
  if (sharedDriveService && sharedDriveService.key === config.clientId) {
    return sharedDriveService.service;
  }
  const service = new GoogleDriveService(config);
  sharedDriveService = { key: config.clientId, service };
  return service;
}

export function resetSharedDriveService(): void {
  sharedDriveService?.service.signOut();
  sharedDriveService = null;
}
