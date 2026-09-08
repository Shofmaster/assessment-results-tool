/**
 * Grant File System Access for AeroGap's own origins.
 *
 * The SPA stores a FileSystemDirectoryHandle in IndexedDB when the user links
 * manuals. After a restart Chromium puts that handle back into "prompt". Search
 * has no user gesture, so without a session-level grant the folder index is
 * silently invisible. Desktop seats should read the linked folder without a
 * second click every launch.
 *
 * Electron 40+ exposes `fileSystem` on both the request and check handlers;
 * older shells still benefit from granting whatever permission name arrives.
 *
 * @param {import('electron').Session} ses
 * @param {() => string[]} getAllowedOrigins  e.g. loopback app URL + hosted origin
 */
function allowAppFileSystemAccess(ses, getAllowedOrigins) {
  const isAllowed = (wc) => {
    if (!wc || typeof wc.getURL !== 'function') return false;
    try {
      const origin = new URL(wc.getURL()).origin;
      return getAllowedOrigins().some((o) => o && o === origin);
    } catch {
      return false;
    }
  };

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'fileSystem') {
      // Grant both readable and writable probes for our app origins so the
      // shared `.aerogap` search index can be saved after link / refresh.
      callback(isAllowed(webContents));
      return;
    }
    // Unrelated permissions keep working; we only override FSA.
    callback(true);
  });

  ses.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'fileSystem') {
      return isAllowed(webContents);
    }
    return true;
  });
}

module.exports = { allowAppFileSystemAccess };
