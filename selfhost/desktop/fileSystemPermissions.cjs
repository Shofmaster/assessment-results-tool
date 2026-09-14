/**
 * Grant File System Access for AeroGap's own origins, and deny other
 * Chromium permissions on foreign pages (Clerk / Google during sign-in).
 *
 * The SPA stores a FileSystemDirectoryHandle in IndexedDB when the user links
 * manuals. After a restart Chromium puts that handle back into "prompt". Search
 * has no user gesture, so without a session-level grant the folder index is
 * silently invisible. Desktop seats should read the linked folder without a
 * second click every launch.
 *
 * Previously every non-fileSystem permission was granted for every origin,
 * including the identity-provider pages the shell navigates through. Those
 * pages have no business asking for camera, mic, geolocation, or notifications
 * inside this window.
 *
 * Electron 40+ exposes `fileSystem` on both the request and check handlers;
 * older shells still benefit from granting whatever permission name arrives.
 *
 * @param {import('electron').Session} ses
 * @param {() => string[]} getAllowedOrigins  e.g. loopback app URL + hosted origin
 */
function allowAppFileSystemAccess(ses, getAllowedOrigins) {
  const isAppOrigin = (wc) => {
    if (!wc || typeof wc.getURL !== 'function') return false;
    try {
      const origin = new URL(wc.getURL()).origin;
      return getAllowedOrigins().some((o) => o && o === origin);
    } catch {
      return false;
    }
  };

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const onApp = isAppOrigin(webContents);
    if (permission === 'fileSystem') {
      // Grant both readable and writable probes for our app origins so the
      // shared `.aerogap` search index can be saved after link / refresh.
      callback(onApp);
      return;
    }
    // App origins: leave other permissions alone (same as before). Foreign
    // pages (OAuth / Clerk): deny everything so a provider page cannot open
    // a notification or geolocation prompt inside the shell.
    callback(onApp);
  });

  ses.setPermissionCheckHandler((webContents, permission) => {
    const onApp = isAppOrigin(webContents);
    if (permission === 'fileSystem') return onApp;
    return onApp;
  });
}

module.exports = { allowAppFileSystemAccess };
