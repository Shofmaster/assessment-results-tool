/**
 * Native linked-manuals folder for the desktop shell.
 *
 * Chromium's File System Access API cannot keep permission across restarts on
 * Electron 33 (and even on 40+ the check handler often gets null webContents).
 * Desktop therefore stores an absolute OS path in userData and reads/writes via
 * Node fs. The renderer never holds a FileSystemDirectoryHandle on this path.
 *
 * Path sandbox: every relative path is resolved under the linked root; escapes
 * via `..` or absolute segments are rejected.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { dialog, ipcMain } = require('electron');

const APP_FOLDER_NAME = '.aerogap';
const STATE_FILE = 'linked-manuals.json';
const LOCAL_INDEX_DIR = 'folder-index';

/**
 * @param {string} userDataDir  Electron app.getPath('userData') or DATA_ROOT
 * @param {() => import('electron').BrowserWindow|null} getWindow
 */
function createLinkedFolderService(userDataDir, getWindow) {
  const statePath = () => path.join(userDataDir, STATE_FILE);
  const localIndexRoot = () => path.join(userDataDir, LOCAL_INDEX_DIR);

  function readState() {
    try {
      const raw = fs.readFileSync(statePath(), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.path === 'string' && parsed.path.trim()) {
        return { path: path.resolve(parsed.path.trim()) };
      }
    } catch {
      /* missing or corrupt */
    }
    return null;
  }

  function writeState(folderPath) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify({ path: folderPath }, null, 2), 'utf8');
  }

  function clearState() {
    try {
      fs.unlinkSync(statePath());
    } catch {
      /* already gone */
    }
  }

  /**
   * Resolve `relativePath` under `root` and reject escapes.
   * @param {string} root
   * @param {string} relativePath  forward-slash or OS separators
   */
  function resolveUnderRoot(root, relativePath) {
    const rootResolved = path.resolve(root);
    const normalized = String(relativePath || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter((s) => s.length > 0 && s !== '.');
    if (normalized.some((s) => s === '..')) {
      throw new Error('Path escapes the linked folder');
    }
    if (normalized.length === 0) {
      throw new Error('Empty path');
    }
    const full = path.resolve(rootResolved, ...normalized);
    const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
    if (full !== rootResolved && !full.startsWith(prefix)) {
      throw new Error('Path escapes the linked folder');
    }
    return full;
  }

  function status() {
    const state = readState();
    if (!state) return { linked: false };
    try {
      const st = fs.statSync(state.path);
      if (!st.isDirectory()) {
        return { linked: false, missing: true, path: state.path };
      }
    } catch {
      return { linked: false, missing: true, path: state.path };
    }
    return {
      linked: true,
      path: state.path,
      name: path.basename(state.path) || state.path,
    };
  }

  /**
   * @param {import('electron').BrowserWindow|null} [win]
   * @returns {Promise<{ cancelled: true } | { cancelled: false, path: string, name: string }>}
   */
  async function pick(win) {
    const browserWindow = win || (typeof getWindow === 'function' ? getWindow() : null);
    const opts = {
      title: 'Link manuals folder',
      properties: ['openDirectory'],
    };
    const result = browserWindow && !browserWindow.isDestroyed()
      ? await dialog.showOpenDialog(browserWindow, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || !result.filePaths?.[0]) {
      return { cancelled: true };
    }
    const folderPath = path.resolve(result.filePaths[0]);
    writeState(folderPath);
    notifyChanged();
    return {
      cancelled: false,
      path: folderPath,
      name: path.basename(folderPath) || folderPath,
    };
  }

  function notifyChanged() {
    const win = typeof getWindow === 'function' ? getWindow() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send('aerogap:folder:changed', status());
    }
  }

  /**
   * @param {string} dir
   * @param {string} prefix  forward-slash relative prefix
   * @param {Array<{relativePath:string,name:string,size:number,lastModified:number,mimeType:string}>} out
   */
  function walkMeta(dir, prefix, out) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === APP_FOLDER_NAME) continue;
      const relativePath = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walkMeta(full, relativePath, out);
      } else if (ent.isFile()) {
        let size = 0;
        let lastModified = 0;
        try {
          const st = fs.statSync(full);
          size = st.size;
          lastModified = Math.trunc(st.mtimeMs);
        } catch {
          /* skip unreadable */
          continue;
        }
        out.push({
          relativePath,
          name: ent.name,
          size,
          lastModified,
          mimeType: '',
        });
      }
    }
  }

  function listMeta() {
    const state = readState();
    if (!state) return [];
    const out = [];
    walkMeta(state.path, '', out);
    return out;
  }

  /**
   * @param {string} relativePath
   * @returns {Promise<ArrayBuffer>}
   */
  async function readFile(relativePath) {
    const state = readState();
    if (!state) throw new Error('No manuals folder is linked');
    const full = resolveUnderRoot(state.path, relativePath);
    const buf = await fsp.readFile(full);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  async function readAppFile(fileName) {
    const state = readState();
    if (!state) return null;
    const safeName = path.basename(String(fileName || ''));
    if (!safeName || safeName === '.' || safeName === '..') return null;
    const full = path.join(state.path, APP_FOLDER_NAME, safeName);
    try {
      return await fsp.readFile(full, 'utf8');
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
      throw err;
    }
  }

  async function writeAppFile(fileName, content) {
    const state = readState();
    if (!state) throw new Error('No manuals folder is linked');
    const safeName = path.basename(String(fileName || ''));
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new Error('Invalid app file name');
    }
    const dir = path.join(state.path, APP_FOLDER_NAME);
    await fsp.mkdir(dir, { recursive: true });
    const full = path.join(dir, safeName);
    const tmp = `${full}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, String(content ?? ''), 'utf8');
    await fsp.rename(tmp, full);
  }

  /** Can we create/write `.aerogap` in the linked folder? */
  async function canWriteAppFolder() {
    const state = readState();
    if (!state) return false;
    try {
      const dir = path.join(state.path, APP_FOLDER_NAME);
      await fsp.mkdir(dir, { recursive: true });
      const probe = path.join(dir, `.write-probe-${process.pid}`);
      await fsp.writeFile(probe, 'ok', 'utf8');
      await fsp.unlink(probe);
      return true;
    } catch {
      return false;
    }
  }

  function localIndexPath(fileName) {
    const safeName = path.basename(String(fileName || ''));
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new Error('Invalid index file name');
    }
    return path.join(localIndexRoot(), safeName);
  }

  async function readLocalIndex(fileName) {
    try {
      return await fsp.readFile(localIndexPath(fileName), 'utf8');
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
      throw err;
    }
  }

  async function writeLocalIndex(fileName, content) {
    await fsp.mkdir(localIndexRoot(), { recursive: true });
    const full = localIndexPath(fileName);
    const tmp = `${full}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, String(content ?? ''), 'utf8');
    await fsp.rename(tmp, full);
  }

  function registerIpc() {
    ipcMain.handle('aerogap:folder:pick', async (event) => {
      const win = require('electron').BrowserWindow.fromWebContents(event.sender);
      return pick(win);
    });
    ipcMain.handle('aerogap:folder:status', () => status());
    ipcMain.handle('aerogap:folder:listMeta', () => listMeta());
    ipcMain.handle('aerogap:folder:readFile', async (_e, relativePath) => readFile(relativePath));
    ipcMain.handle('aerogap:folder:readAppFile', async (_e, fileName) => readAppFile(fileName));
    ipcMain.handle('aerogap:folder:writeAppFile', async (_e, fileName, content) => {
      await writeAppFile(fileName, content);
      return true;
    });
    ipcMain.handle('aerogap:folder:canWriteAppFolder', async () => canWriteAppFolder());
    ipcMain.handle('aerogap:folder:readLocalIndex', async (_e, fileName) => readLocalIndex(fileName));
    ipcMain.handle('aerogap:folder:writeLocalIndex', async (_e, fileName, content) => {
      await writeLocalIndex(fileName, content);
      return true;
    });
    ipcMain.handle('aerogap:folder:clear', () => {
      clearState();
      notifyChanged();
      return true;
    });
  }

  return {
    pick,
    status,
    listMeta,
    readFile,
    readAppFile,
    writeAppFile,
    canWriteAppFolder,
    readLocalIndex,
    writeLocalIndex,
    clearState,
    resolveUnderRoot,
    registerIpc,
    APP_FOLDER_NAME,
  };
}

module.exports = {
  createLinkedFolderService,
  APP_FOLDER_NAME,
};
