/**
 * Preload for the shell's own pages.
 *
 * The application gets NO general privileged bridge - it is a web app and
 * should stay one. What is exposed here is small and one-directional: the
 * loading screen listens for progress, the app can collect a bundle the
 * user double-clicked in Explorer, and desktop seats can link a manuals
 * folder by OS path (Node fs) so search works after restart without Chromium
 * File System Access permission games.
 *
 * WHO GETS IT
 * The bridge is installed only on pages that are the application: the loading
 * screen (file:), the local server (loopback) and, in the online workspace,
 * the hosted application. The window also passes through the identity
 * provider's pages and Google's during sign-in; those get nothing. Not because
 * the bridge is dangerous - it is not - but because the set of pages with a
 * `window.aerogapShell` should be exactly the set we wrote.
 */
const { contextBridge, ipcRenderer } = require('electron');

/** Read a `--flag=value` the main process appended to this renderer's argv. */
function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

function isApplicationPage() {
  const { protocol, hostname, origin } = window.location;
  if (protocol === 'file:') return true;
  if (protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost')) return true;
  const hosted = argValue('aerogap-hosted-origin');
  return Boolean(hosted) && origin === hosted;
}

if (isApplicationPage()) {
  contextBridge.exposeInMainWorld('aerogapShell', {
    onWaiting: (callback) => {
      if (typeof callback !== 'function') return;
      ipcRenderer.on('aerogap:waiting', (_event, attempt) => callback(attempt));
    },
    onStatus: (callback) => {
      if (typeof callback !== 'function') return;
      ipcRenderer.on('aerogap:status', (_event, text) => callback(text));
    },
    consumePendingBundle: () => ipcRenderer.invoke('aerogap:consumePendingBundle'),
    consumePendingOrgBundle: () => ipcRenderer.invoke('aerogap:consumePendingOrgBundle'),
    folder: {
      pick: () => ipcRenderer.invoke('aerogap:folder:pick'),
      status: () => ipcRenderer.invoke('aerogap:folder:status'),
      listMeta: () => ipcRenderer.invoke('aerogap:folder:listMeta'),
      readFile: (relativePath) => ipcRenderer.invoke('aerogap:folder:readFile', relativePath),
      readAppFile: (fileName) => ipcRenderer.invoke('aerogap:folder:readAppFile', fileName),
      writeAppFile: (fileName, content) =>
        ipcRenderer.invoke('aerogap:folder:writeAppFile', fileName, content),
      canWriteAppFolder: () => ipcRenderer.invoke('aerogap:folder:canWriteAppFolder'),
      readLocalIndex: (fileName) => ipcRenderer.invoke('aerogap:folder:readLocalIndex', fileName),
      writeLocalIndex: (fileName, content) =>
        ipcRenderer.invoke('aerogap:folder:writeLocalIndex', fileName, content),
      clear: () => ipcRenderer.invoke('aerogap:folder:clear'),
      onChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, status) => callback(status);
        ipcRenderer.on('aerogap:folder:changed', handler);
        return () => ipcRenderer.removeListener('aerogap:folder:changed', handler);
      },
    },
  });
}
