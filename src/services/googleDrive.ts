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
            /** Fired when the token flow fails outside `callback` (popup blocked/closed, etc.). */
            error_callback?: (error: { type?: string; message?: string }) => void;
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
/** App folder that holds per-project vector index files (`<projectId>.aqv.json`). */
const APP_FOLDER_NAME = 'Assessment Analyzer';
/** Give the GIS silent token flow this long before treating it as failed. */
const SILENT_SIGN_IN_TIMEOUT_MS = 15_000;
/** Attempt a silent token refresh this long before the current one expires. */
const PROACTIVE_REFRESH_LEAD_MS = 5 * 60_000;
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
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: GoogleDriveConfig) {
    this.config = config;
  }

  /** Store a fresh token and arm the pre-expiry silent refresh. */
  private setToken(accessToken: string, expiresInSeconds: number): void {
    this.accessToken = accessToken;
    this.tokenExpiry = Date.now() + expiresInSeconds * 1000;
    this.scheduleProactiveRefresh();
  }

  /**
   * Google access tokens live ~1 hour; without a refresh the Drive half of
   * search silently drops out mid-session. Try a silent refresh a few minutes
   * before expiry — with an active Google session this completes without UI.
   * Failure is harmless (error_callback/timeout settle it); the reconnect
   * affordances handle the rest.
   */
  private scheduleProactiveRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    const fireIn = this.tokenExpiry - Date.now() - PROACTIVE_REFRESH_LEAD_MS;
    if (fireIn <= 0) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.silentSignIn();
    }, fireIn);
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

          this.setToken(response.access_token, response.expires_in);

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
        // GIS never invokes `callback` when the popup is blocked or dismissed —
        // without this handler the returned promise would hang forever.
        error_callback: (error) => {
          reject(
            new Error(
              error?.type === 'popup_failed_to_open'
                ? 'Google sign-in popup was blocked. Allow popups for this site and try again.'
                : `Google sign-in was not completed (${error?.type || 'unknown error'}).`,
            ),
          );
        },
      });

      tokenClient.requestAccessToken();
    });
  }

  signOut(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
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
      // GIS can fail without ever invoking `callback` (blocked/dismissed popup);
      // `error_callback` covers the reported cases and the timer guarantees this
      // promise settles even if neither fires. Late resolve() calls are no-ops.
      const timer = setTimeout(() => resolve(null), SILENT_SIGN_IN_TIMEOUT_MS);
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_SCOPE,
        callback: async (response) => {
          clearTimeout(timer);
          if (response.error) {
            resolve(null);
            return;
          }

          this.setToken(response.access_token, response.expires_in);

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
        error_callback: () => {
          clearTimeout(timer);
          resolve(null);
        },
      });

      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  /**
   * Return a live access token, refreshing silently when possible. By default a
   * failed silent refresh escalates to the interactive popup flow — pass
   * `interactive: false` from background work (search retrieval, auto-loaded
   * panels) where no user gesture exists: browsers block the popup there, so
   * escalating could never succeed and previously hung the caller.
   */
  async ensureValidToken(options?: { interactive?: boolean }): Promise<string> {
    if (this.isSignedIn() && this.accessToken) {
      return this.accessToken;
    }
    const silentResult = await this.silentSignIn();
    if (silentResult?.isSignedIn && this.accessToken) {
      return this.accessToken;
    }
    if (options?.interactive === false) {
      throw new Error(
        'Google Drive session expired. Reconnect via Library → Refresh search index.',
      );
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
    const folders = await this.pickFolders();
    return folders[0] ?? null;
  }

  /**
   * Prompt the user to pick one or more Drive folders. The FOLDERS view with
   * folder-selection + multi-select lets the user ctrl/shift-click several folders
   * (or drill in and pick a few) in one pass. Returns an empty array if cancelled.
   */
  async pickFolders(): Promise<Array<{ id: string; name: string }>> {
    await this.loadScripts();
    const token = await this.ensureValidToken();

    if (!window.google?.picker) {
      throw new Error('Google Picker API not loaded');
    }

    return new Promise((resolve) => {
      const picker = window.google!.picker;
      // FOLDERS view with folder-selection enabled lets the user drill in and pick folders.
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const pickerBuilder = new picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(this.config.apiKey)
        .addView(view)
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: GooglePickerResponse) => {
          if (data.action === picker.Action.PICKED && data.docs) {
            const folders = data.docs
              .filter((doc) => doc.mimeType === 'application/vnd.google-apps.folder')
              .map((doc) => ({ id: doc.id, name: doc.name }));
            resolve(folders);
          } else if (data.action === picker.Action.CANCEL) {
            resolve([]);
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

  /**
   * Download a Drive file's bytes. `maxBytes` fetches only the head of the file via an
   * HTTP Range header (Drive supports ranged `alt=media`) — for cheap text peeks. Do NOT
   * pass `maxBytes` for PDF/DOCX: their parsers need the end of the file (xref table /
   * zip central directory). Falls back to a full download if the ranged request fails.
   */
  async downloadFile(fileId: string, options?: { maxBytes?: number }): Promise<ArrayBuffer> {
    const token = await this.ensureValidToken();
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    if (options?.maxBytes && options.maxBytes > 0) {
      const ranged = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${options.maxBytes - 1}` },
      });
      // 206 = partial content; 200 = server ignored the Range (small file) — both fine.
      if (ranged.ok) return ranged.arrayBuffer();
    }

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  /** Escape single quotes for use inside a Drive `q` string literal. */
  private escapeQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Find a folder by name (optionally under a parent), or create it. Returns the
   * folder id. Used to keep the per-project vector index files in one app folder.
   */
  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const token = await this.ensureValidToken();
    const parentClause = parentId ? ` and '${parentId}' in parents` : '';
    const q =
      `name='${this.escapeQueryValue(name)}' and ` +
      `mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name)',
      pageSize: '1',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) {
      throw new Error(`Failed to look up folder: ${listRes.status} ${listRes.statusText}`);
    }
    const listData = (await listRes.json()) as { files?: Array<{ id: string }> };
    const existing = listData.files?.[0];
    if (existing) return existing.id;

    const metadata: Record<string, unknown> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    };
    const createRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      },
    );
    if (!createRes.ok) {
      throw new Error(`Failed to create folder: ${createRes.status} ${createRes.statusText}`);
    }
    const createData = (await createRes.json()) as { id: string };
    return createData.id;
  }

  /** Find a non-folder file by exact name within a folder. Returns null if absent. */
  async findFileInFolder(folderId: string, name: string): Promise<{ id: string; name: string } | null> {
    const token = await this.ensureValidToken();
    const q =
      `name='${this.escapeQueryValue(name)}' and '${folderId}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name)',
      pageSize: '1',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to find file: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    const f = data.files?.[0];
    return f ? { id: f.id, name: f.name } : null;
  }

  /** Create a new text file in a folder (multipart upload). Returns the new file id. */
  async uploadTextFile(
    folderId: string,
    name: string,
    mimeType: string,
    content: string,
  ): Promise<string> {
    const token = await this.ensureValidToken();
    const metadata = { name, parents: [folderId], mimeType };
    const boundary = `aqv${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to upload file: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  /** Overwrite an existing file's content (media upload). */
  async updateTextFile(fileId: string, mimeType: string, content: string): Promise<void> {
    const token = await this.ensureValidToken();
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
        body: content,
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to update file: ${res.status} ${res.statusText}`);
    }
  }

  /** Convenience: the app's dedicated folder that holds per-project index files. */
  async ensureAppFolder(): Promise<string> {
    return this.ensureFolder(APP_FOLDER_NAME);
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
