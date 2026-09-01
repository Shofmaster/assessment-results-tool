/**
 * Preload for the loading screen only.
 *
 * The real application is served from the local server and gets NO privileged
 * bridge - it is a web app and should stay one. The single channel exposed here
 * lets the splash show progress while the Windows Services finish starting, and
 * it is receive-only.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aerogapShell', {
  onWaiting: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('aerogap:waiting', (_event, attempt) => callback(attempt));
  },
  // Named startup stages, used in desktop mode where this process is starting
  // the backend itself and therefore knows what it is doing at each moment.
  // Server mode has no such visibility and only ever sends onWaiting.
  onStatus: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('aerogap:status', (_event, text) => callback(text));
  },
});
